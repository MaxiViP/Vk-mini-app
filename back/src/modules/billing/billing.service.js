import crypto from 'node:crypto'

import prisma from '../../db/prisma.js'
import { isLegacyBillingSchemaError, prismaCompat } from '../../db/prisma-compat.js'
import { AppError } from '../../shared/errors.js'
import { logBusinessEvent } from '../../shared/observability.js'
import { isAdminUser } from '../../shared/access.js'
import { PLAN_CATALOG, PAYG_PRICING_MINOR, formatMoneyMinor } from './billing.catalog.js'

const DEFAULT_CURRENCY = 'RUB'

const toMinor = amount => {
	const numeric = Number(amount)
	if (!Number.isFinite(numeric) || numeric <= 0) throw new AppError('amount must be a positive number', 400)
	return Math.round(numeric * 100)
}

const addDays = (date, days) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000)

const createStubQrCode = payload =>
	'data:image/svg+xml;charset=UTF-8,' +
	encodeURIComponent(
		`<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220"><rect width="220" height="220" fill="white"/><rect x="10" y="10" width="200" height="200" fill="none" stroke="black" stroke-width="4"/><text x="110" y="100" text-anchor="middle" font-size="14" font-family="monospace">YOOKASSA</text><text x="110" y="124" text-anchor="middle" font-size="12" font-family="monospace">${payload}</text></svg>`,
	)

const billingV2Available = prismaCompat.hasPlanBillingFields && prismaCompat.hasSubscriptionBillingFields

const serializePlan = plan => ({
	id: plan.id,
	code: plan.code,
	name: plan.name,
	priceMinor: plan.priceMinor,
	price: formatMoneyMinor(plan.priceMinor),
	intervalDays: plan.intervalDays,
	includedRequests: plan.includedRequests,
	accessTier: plan.accessTier,
	isActive: plan.isActive,
})

const serializeSubscription = subscription =>
	subscription
		? {
				id: subscription.id,
				status: subscription.status,
				startedAt: subscription.periodStart,
				expiresAt: subscription.periodEnd,
				cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
				includedRequests: subscription.includedRequests,
				usedRequests: subscription.usedRequests,
				remainingRequests: Math.max(subscription.includedRequests - subscription.usedRequests, 0),
				plan: subscription.plan ? serializePlan(subscription.plan) : null,
			}
		: null

const serializeLedgerEntry = entry => ({
	id: entry.id,
	type: entry.type,
	reason: entry.reason,
	amountMinor: entry.amountMinor,
	amount: formatMoneyMinor(entry.amountMinor),
	referenceType: entry.referenceType,
	referenceId: entry.referenceId,
	createdAt: entry.createdAt,
})

const serializePayment = payment => ({
	id: payment.id,
	provider: payment.provider,
	status: payment.status,
	amountMinor: payment.amountMinor,
	amount: formatMoneyMinor(payment.amountMinor),
	createdAt: payment.createdAt,
	updatedAt: payment.updatedAt,
})

const buildLegacyPlans = () =>
	PLAN_CATALOG.map(plan => ({
		id: plan.code,
		code: plan.code,
		name: plan.name,
		priceMinor: plan.priceMinor,
		price: formatMoneyMinor(plan.priceMinor),
		intervalDays: plan.intervalDays,
		includedRequests: plan.includedRequests,
		accessTier: plan.accessTier,
		isActive: true,
	}))

const getLegacySummary = async ({ userId, historyLimit = 20 }) => {
	await ensureWalletExists(prisma, userId)

	const [wallet, ledger, payments] = await Promise.all([
		prisma.wallet.findUnique({ where: { userId } }),
		prisma.walletLedger.findMany({
			where: { userId },
			take: Math.min(Number(historyLimit) || 20, 100),
			orderBy: { createdAt: 'desc' },
		}),
		prisma.payment.findMany({
			where: { userId },
			take: Math.min(Number(historyLimit) || 20, 100),
			orderBy: { createdAt: 'desc' },
		}),
	])

	return {
		wallet: {
			balanceMinor: wallet?.balanceMinor || 0,
			balance: formatMoneyMinor(wallet?.balanceMinor || 0),
			currency: wallet?.currency || DEFAULT_CURRENCY,
		},
		activeSubscription: null,
		plans: buildLegacyPlans(),
		paygPricing: {
			basicMinor: PAYG_PRICING_MINOR.basic,
			basic: formatMoneyMinor(PAYG_PRICING_MINOR.basic),
			premiumMinor: PAYG_PRICING_MINOR.premium,
			premium: formatMoneyMinor(PAYG_PRICING_MINOR.premium),
		},
		usageSnapshot: {
			remainingIncludedRequests: 0,
			mode: 'payg',
		},
		recentLedger: ledger.map(serializeLedgerEntry),
		recentPayments: payments.map(serializePayment),
		legacyBillingMode: true,
	}
}

export const ensureWalletExists = async (db, userId) =>
	db.wallet.upsert({
		where: { userId },
		update: {},
		create: { userId, balanceMinor: 0, currency: DEFAULT_CURRENCY },
	})

export const ensurePlanCatalogSeeded = async () => {
	if (!billingV2Available) return

	await Promise.all(
		PLAN_CATALOG.map(plan =>
			prisma.plan.upsert({
				where: { code: plan.code },
				update: {
					name: plan.name,
					priceMinor: plan.priceMinor,
					intervalDays: plan.intervalDays,
					includedRequests: plan.includedRequests,
					accessTier: plan.accessTier,
					isActive: true,
				},
				create: plan,
			}),
		),
	)
}

export const expireElapsedSubscriptions = async (db, userId = null) => {
	if (!billingV2Available) return

	const now = new Date()
	const where = {
		status: { in: ['active', 'trialing', 'past_due'] },
		periodEnd: { lt: now },
		...(userId ? { userId } : {}),
	}

	await db.subscription.updateMany({
		where,
		data: {
			status: 'expired',
			endedAt: now,
		},
	})
}

export const getActiveSubscriptionWithPlan = async (db, userId) =>
	!billingV2Available
		? null
		: db.subscription.findFirst({
				where: {
					userId,
					status: { in: ['active', 'trialing', 'past_due'] },
					periodEnd: { gt: new Date() },
				},
				orderBy: { periodEnd: 'desc' },
				include: { plan: true },
			})

export const resolveUsageBillingContext = async ({ db = prisma, userId, modelTier }) => {
	await ensureWalletExists(db, userId)
	if (!billingV2Available) {
		return {
			wallet: await db.wallet.findUnique({ where: { userId } }),
			subscription: null,
			billingSource: 'payg',
			costMinor: 0,
		}
	}

	await expireElapsedSubscriptions(db, userId)

	const [wallet, subscription] = await Promise.all([
		db.wallet.findUnique({ where: { userId } }),
		getActiveSubscriptionWithPlan(db, userId),
	])

	const hasIncludedAccess =
		subscription &&
		subscription.plan &&
		(subscription.plan.accessTier === 'premium' || subscription.plan.accessTier === modelTier) &&
		subscription.usedRequests < subscription.includedRequests

	return {
		wallet,
		subscription,
		billingSource: hasIncludedAccess ? 'subscription_included' : 'payg',
		costMinor: hasIncludedAccess ? 0 : PAYG_PRICING_MINOR[modelTier] || PAYG_PRICING_MINOR.basic,
	}
}

const buildPaymentSession = payment => {
	const amount = formatMoneyMinor(payment.amountMinor)
	const qrPayload = `YOOKASSA-STUB:${payment.id}:${payment.amountMinor}`

	return {
		paymentId: payment.id,
		amount,
		status: payment.status,
		confirmationUrl: `https://yookassa.ru/mock/${payment.id}`,
		qrCodeDataUrl: createStubQrCode(payment.id.slice(0, 12)),
		qrPayload,
		isStub: true,
		provider: 'yookassa',
	}
}

export const billingService = {
	async applySuccessfulPayment(payment) {
		if (!payment) throw new AppError('Payment not found', 404)

		await prisma.$transaction(async tx => {
			const currentPayment = await tx.payment.findUnique({ where: { id: payment.id } })
			if (!currentPayment) throw new AppError('Payment not found', 404)

			if (currentPayment.status !== 'succeeded') {
				await tx.payment.update({
					where: { id: currentPayment.id },
					data: { status: 'succeeded' },
				})
			}

			const ledgerKey = `payment_success_${currentPayment.id}`
			const existingLedger = await tx.walletLedger.findUnique({ where: { idempotencyKey: ledgerKey } })
			if (existingLedger) return

			await ensureWalletExists(tx, currentPayment.userId)
			await tx.wallet.update({
				where: { userId: currentPayment.userId },
				data: { balanceMinor: { increment: currentPayment.amountMinor } },
			})
			await tx.walletLedger.create({
				data: {
					userId: currentPayment.userId,
					type: 'credit',
					amountMinor: currentPayment.amountMinor,
					reason: 'payment_topup',
					referenceType: 'payment',
					referenceId: currentPayment.id,
					idempotencyKey: ledgerKey,
				},
			})
		})

		await logBusinessEvent({
			eventType: 'balance.changed',
			actorUserId: payment.userId,
			entityType: 'wallet',
			entityId: payment.userId,
			payload: { deltaMinor: payment.amountMinor, reason: 'payment_topup' },
		})
	},

	async createYooKassaPayment({ userId, amount, returnUrl, idempotencyKey }) {
		const amountMinor = toMinor(amount)
		const safeIdempotencyKey = idempotencyKey || crypto.randomUUID()

		const existing = await prisma.payment.findUnique({ where: { idempotencyKey: safeIdempotencyKey } })
		if (existing) {
			return buildPaymentSession(existing)
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
				rawPayload: {
					returnUrl: returnUrl || null,
					mode: 'stub',
				},
			},
		})

		await logBusinessEvent({
			eventType: 'payment.created',
			actorUserId: userId,
			entityType: 'payment',
			entityId: payment.id,
			payload: { amountMinor, idempotencyKey: safeIdempotencyKey },
		})

		return buildPaymentSession(payment)
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
					: payload?.event === 'payment.waiting_for_capture'
						? 'pending'
						: 'failed'

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
			await this.applySuccessfulPayment(payment)
		}

		return updated
	},

	async confirmYooKassaPayment({ paymentId, actorUserId }) {
		const payment = await prisma.payment.findUnique({ where: { id: paymentId } })
		if (!payment) throw new AppError('Payment not found', 404)
		if (payment.userId !== actorUserId && !(await isAdminUser(actorUserId))) {
			throw new AppError('Forbidden', 403)
		}

		await prisma.paymentEvent.create({
			data: {
				paymentId: payment.id,
				eventType: 'manual_confirm',
				rawPayload: { actorUserId, mode: 'stub' },
			},
		})

		await this.applySuccessfulPayment(payment)

		return {
			paymentId: payment.id,
			status: 'succeeded',
			amount: formatMoneyMinor(payment.amountMinor),
			isStub: true,
		}
	},

	async purchaseSubscription({ userId, planCode, idempotencyKey }) {
		if (!billingV2Available) {
			throw new AppError('Subscription billing requires billing migration on the server', 503)
		}

		await ensurePlanCatalogSeeded()

		const safeIdempotencyKey = idempotencyKey || crypto.randomUUID()
		const existingLedger = await prisma.walletLedger.findUnique({
			where: { idempotencyKey: `subscription_purchase_${safeIdempotencyKey}` },
		})
		if (existingLedger?.referenceId) {
			const existingSubscription = await prisma.subscription.findUnique({
				where: { id: existingLedger.referenceId },
				include: { plan: true },
			})
			if (existingSubscription) {
				return {
					subscription: serializeSubscription(existingSubscription),
					balanceMinor: (
						await ensureWalletExists(prisma, userId).then(() => prisma.wallet.findUnique({ where: { userId } }))
					)?.balanceMinor || 0,
					idempotentReplay: true,
				}
			}
		}

		const result = await prisma.$transaction(async tx => {
			await ensureWalletExists(tx, userId)
			await expireElapsedSubscriptions(tx, userId)

			const [wallet, plan] = await Promise.all([
				tx.wallet.findUnique({ where: { userId } }),
				tx.plan.findUnique({ where: { code: planCode } }),
			])

			if (!plan || !plan.isActive) throw new AppError('Plan not found', 404)
			if ((wallet?.balanceMinor || 0) < plan.priceMinor) {
				throw new AppError('Insufficient balance for subscription purchase', 402)
			}

			await tx.subscription.updateMany({
				where: {
					userId,
					status: { in: ['active', 'trialing', 'past_due'] },
				},
				data: {
					status: 'canceled',
					endedAt: new Date(),
				},
			})

			const periodStart = new Date()
			const periodEnd = addDays(periodStart, plan.intervalDays)

			const subscription = await tx.subscription.create({
				data: {
					userId,
					planId: plan.id,
					status: 'active',
					periodStart,
					periodEnd,
					includedRequests: plan.includedRequests,
					usedRequests: 0,
				},
				include: { plan: true },
			})

			await tx.wallet.update({
				where: { userId },
				data: { balanceMinor: { decrement: plan.priceMinor } },
			})

			await tx.walletLedger.create({
				data: {
					userId,
					type: 'debit',
					amountMinor: plan.priceMinor,
					reason: 'subscription_purchase',
					referenceType: 'subscription',
					referenceId: subscription.id,
					idempotencyKey: `subscription_purchase_${safeIdempotencyKey}`,
				},
			})

			const updatedWallet = await tx.wallet.findUnique({ where: { userId } })

			return {
				subscription,
				wallet: updatedWallet,
			}
		})

		await logBusinessEvent({
			eventType: 'subscription.purchased',
			actorUserId: userId,
			entityType: 'subscription',
			entityId: result.subscription.id,
			payload: {
				planCode,
				priceMinor: result.subscription.plan.priceMinor,
			},
		})
		await logBusinessEvent({
			eventType: 'balance.changed',
			actorUserId: userId,
			entityType: 'wallet',
			entityId: userId,
			payload: {
				deltaMinor: -result.subscription.plan.priceMinor,
				reason: 'subscription_purchase',
			},
		})

		return {
			subscription: serializeSubscription(result.subscription),
			balanceMinor: result.wallet?.balanceMinor || 0,
			idempotentReplay: false,
		}
	},

	async getSummary({ userId, historyLimit = 20 }) {
		if (!billingV2Available) {
			return getLegacySummary({ userId, historyLimit })
		}

		try {
			await ensurePlanCatalogSeeded()
			await ensureWalletExists(prisma, userId)
			await expireElapsedSubscriptions(prisma, userId)

			const [wallet, activeSubscription, plans, ledger, payments] = await Promise.all([
				prisma.wallet.findUnique({ where: { userId } }),
				getActiveSubscriptionWithPlan(prisma, userId),
				prisma.plan.findMany({ where: { isActive: true }, orderBy: [{ priceMinor: 'asc' }] }),
				prisma.walletLedger.findMany({
					where: { userId },
					take: Math.min(Number(historyLimit) || 20, 100),
					orderBy: { createdAt: 'desc' },
				}),
				prisma.payment.findMany({
					where: { userId },
					take: Math.min(Number(historyLimit) || 20, 100),
					orderBy: { createdAt: 'desc' },
				}),
			])

			return {
				wallet: {
					balanceMinor: wallet?.balanceMinor || 0,
					balance: formatMoneyMinor(wallet?.balanceMinor || 0),
					currency: wallet?.currency || DEFAULT_CURRENCY,
				},
				activeSubscription: serializeSubscription(activeSubscription),
				plans: plans.map(serializePlan),
				paygPricing: {
					basicMinor: PAYG_PRICING_MINOR.basic,
					basic: formatMoneyMinor(PAYG_PRICING_MINOR.basic),
					premiumMinor: PAYG_PRICING_MINOR.premium,
					premium: formatMoneyMinor(PAYG_PRICING_MINOR.premium),
				},
				usageSnapshot: {
					remainingIncludedRequests: activeSubscription
						? Math.max(activeSubscription.includedRequests - activeSubscription.usedRequests, 0)
						: 0,
					mode: activeSubscription ? activeSubscription.plan.code : 'payg',
				},
				recentLedger: ledger.map(serializeLedgerEntry),
				recentPayments: payments.map(serializePayment),
			}
		} catch (error) {
			if (!isLegacyBillingSchemaError(error)) throw error
			return getLegacySummary({ userId, historyLimit })
		}
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

		return {
			payments: payments.map(serializePayment),
			ledger: ledger.map(serializeLedgerEntry),
		}
	},

	async getPaymentById({ paymentId, actorUserId }) {
		const payment = await prisma.payment.findUnique({
			where: { id: paymentId },
			include: { events: { orderBy: { receivedAt: 'desc' } } },
		})
		if (!payment) throw new AppError('Payment not found', 404)
		if (payment.userId !== actorUserId && !(await isAdminUser(actorUserId))) {
			throw new AppError('Forbidden', 403)
		}
		return {
			...serializePayment(payment),
			events: payment.events,
		}
	},
}
