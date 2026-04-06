import crypto from 'node:crypto'

import prisma from '../../db/prisma.js'
import { AppError } from '../../shared/errors.js'
import { logBusinessEvent } from '../../shared/observability.js'

const toMinor = amount => {
	const numeric = Number(amount)
	if (!Number.isFinite(numeric) || numeric <= 0) throw new AppError('amount must be a positive number', 400)
	return Math.round(numeric * 100)
}

export const billingService = {
	async createYooKassaPayment({ userId, amount, returnUrl, idempotencyKey }) {
		const amountMinor = toMinor(amount)
		const safeIdempotencyKey = idempotencyKey || crypto.randomUUID()

		const existing = await prisma.payment.findUnique({ where: { idempotencyKey: safeIdempotencyKey } })
		if (existing) {
			return {
				id: existing.id,
				provider: existing.provider,
				status: existing.status,
				amountMinor: existing.amountMinor,
				confirmationUrl: `https://yookassa.ru/mock/${existing.id}`,
			}
		}

		const payment = await prisma.payment.create({
			data: {
				userId,
				provider: 'yookassa',
				providerPaymentId: `yoopay_${crypto.randomUUID()}`,
				amountMinor,
				status: 'pending',
				idempotencyKey: safeIdempotencyKey,
			},
		})

		await prisma.paymentEvent.create({
			data: {
				paymentId: payment.id,
				eventType: 'create',
				rawPayload: { returnUrl: returnUrl || null },
			},
		})

		await logBusinessEvent({
			eventType: 'payment.created',
			actorUserId: userId,
			entityType: 'payment',
			entityId: payment.id,
			payload: { amountMinor, idempotencyKey: safeIdempotencyKey },
		})

		return {
			id: payment.id,
			provider: 'yookassa',
			status: payment.status,
			amountMinor,
			confirmationUrl: `https://yookassa.ru/mock/${payment.id}`,
		}
	},

	async handleYooKassaWebhook(payload) {
		const providerPaymentId = payload?.object?.id || payload?.paymentId
		if (!providerPaymentId) throw new AppError('provider payment id is required', 400)

		const payment = await prisma.payment.findUnique({ where: { providerPaymentId } })
		if (!payment) throw new AppError('Payment not found', 404)

		const status =
			payload?.event === 'payment.succeeded'
				? 'succeeded'
				: payload?.event === 'payment.canceled'
					? 'canceled'
					: 'pending'

		const updated = await prisma.payment.update({
			where: { id: payment.id },
			data: { status },
		})

		await prisma.paymentEvent.create({
			data: {
				paymentId: payment.id,
				eventType: payload?.event || 'unknown',
				rawPayload: payload,
			},
		})

		await logBusinessEvent({
			eventType: `payment.${status}`,
			actorUserId: payment.userId,
			entityType: 'payment',
			entityId: payment.id,
			payload: { providerPaymentId },
		})

		if (status === 'succeeded') {
			await prisma.wallet.upsert({
				where: { userId: payment.userId },
				update: { balanceMinor: { increment: payment.amountMinor } },
				create: { userId: payment.userId, balanceMinor: payment.amountMinor, currency: 'RUB' },
			})

			const ledgerKey = `payment_success_${payment.id}`
			const ledgerExisting = await prisma.walletLedger.findUnique({ where: { idempotencyKey: ledgerKey } })
			if (!ledgerExisting) {
				await prisma.walletLedger.create({
					data: {
						userId: payment.userId,
						type: 'credit',
						amountMinor: payment.amountMinor,
						reason: 'payment_topup',
						referenceType: 'payment',
						referenceId: payment.id,
						idempotencyKey: ledgerKey,
					},
				})
			}

			await logBusinessEvent({
				eventType: 'balance.changed',
				actorUserId: payment.userId,
				entityType: 'wallet',
				entityId: payment.userId,
				payload: { deltaMinor: payment.amountMinor, reason: 'payment_topup' },
			})
		}

		return updated
	},

	async getHistory({ userId, limit = 50 }) {
		const [payments, ledger] = await Promise.all([
			prisma.payment.findMany({
				where: { userId },
				take: Math.min(limit, 200),
				orderBy: { createdAt: 'desc' },
			}),
			prisma.walletLedger.findMany({
				where: { userId },
				take: Math.min(limit, 200),
				orderBy: { createdAt: 'desc' },
			}),
		])

		return { payments, ledger }
	},
	async getPaymentById(paymentId) {
		const payment = await prisma.payment.findUnique({
			where: { id: paymentId },
			include: { events: { orderBy: { receivedAt: 'desc' } } },
		})
		if (!payment) throw new AppError('Payment not found', 404)
		return payment
	},
}
