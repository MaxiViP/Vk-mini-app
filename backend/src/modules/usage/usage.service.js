import crypto from 'node:crypto'

import prisma from '../../db/prisma.js'
import { AppError } from '../../shared/errors.js'
import { logBusinessEvent } from '../../shared/observability.js'
import { ensureWalletExists, resolveUsageBillingContext } from '../billing/billing.service.js'

const STALE_PENDING_MS = 10 * 60 * 1000

const rollbackPendingUsageEvent = async (tx, event) => {
	if (!event || event.status !== 'pending') return event

	if (event.billingSource === 'payg' && event.costMinor > 0) {
		await ensureWalletExists(tx, event.userId)
		await tx.wallet.update({
			where: { userId: event.userId },
			data: { balanceMinor: { increment: event.costMinor } },
		})

		const refundKey = `usage_refund_${event.requestId}`
		const existingRefund = await tx.walletLedger.findUnique({ where: { idempotencyKey: refundKey } })
		if (!existingRefund) {
			await tx.walletLedger.create({
				data: {
					userId: event.userId,
					type: 'refund',
					amountMinor: event.costMinor,
					reason: 'usage_charge',
					referenceType: 'usage_event',
					referenceId: event.id,
					idempotencyKey: refundKey,
				},
			})
		}
	}

	if (event.billingSource === 'subscription_included' && event.subscriptionId) {
		await tx.subscription.updateMany({
			where: {
				id: event.subscriptionId,
				usedRequests: { gt: 0 },
			},
			data: { usedRequests: { decrement: 1 } },
		})
	}

	return tx.usageEvent.update({
		where: { id: event.id },
		data: { status: 'reversed' },
	})
}

export const usageService = {
	async cleanupStalePending(userId = null) {
		const staleEvents = await prisma.usageEvent.findMany({
			where: {
				status: 'pending',
				createdAt: { lt: new Date(Date.now() - STALE_PENDING_MS) },
				...(userId ? { userId } : {}),
			},
		})

		for (const event of staleEvents) {
			await prisma.$transaction(tx => rollbackPendingUsageEvent(tx, event))
		}

		return staleEvents.length
	},

	async getUsage(userId) {
		await this.cleanupStalePending(userId)

		const events = await prisma.usageEvent.findMany({
			where: {
				userId,
				status: 'completed',
			},
			orderBy: { createdAt: 'desc' },
			take: 50,
			include: {
				subscription: {
					include: { plan: true },
				},
			},
		})

		const summary = events.reduce(
			(acc, item) => {
				acc.requests += 1
				acc.inputTokens += item.inputTokens
				acc.outputTokens += item.outputTokens
				acc.costMinor += item.costMinor
				if (item.billingSource === 'subscription_included') {
					acc.subscriptionRequests += 1
				} else {
					acc.paygRequests += 1
				}
				return acc
			},
			{ requests: 0, inputTokens: 0, outputTokens: 0, costMinor: 0, subscriptionRequests: 0, paygRequests: 0 },
		)

		return { userId, summary, events }
	},

	async beginCharge({ userId, modelProvider, modelName, modelTier = 'basic', requestId }) {
		if (!modelProvider || !modelName) throw new AppError('modelProvider and modelName are required', 400)

		await this.cleanupStalePending(userId)

		const normalizedRequestId = requestId || crypto.randomUUID()
		const existingEvent = await prisma.usageEvent.findUnique({ where: { requestId: normalizedRequestId } })
		if (existingEvent) {
			return {
				event: existingEvent,
				requestId: normalizedRequestId,
				replayed: true,
			}
		}

		const event = await prisma.$transaction(async tx => {
			const decision = await resolveUsageBillingContext({
				db: tx,
				userId,
				modelTier,
			})

			const usageEvent = await tx.usageEvent.create({
				data: {
					userId,
					modelProvider,
					modelName,
					billingTier: modelTier,
					billingSource: decision.billingSource,
					status: 'pending',
					subscriptionId: decision.subscription?.id || null,
					costMinor: decision.costMinor,
					requestId: normalizedRequestId,
				},
			})

			if (decision.billingSource === 'payg') {
				if ((decision.wallet?.balanceMinor || 0) < decision.costMinor) {
					throw new AppError('Insufficient balance', 402)
				}

				await tx.wallet.update({
					where: { userId },
					data: { balanceMinor: { decrement: decision.costMinor } },
				})
				await tx.walletLedger.create({
					data: {
					userId,
					type: 'debit',
					amountMinor: decision.costMinor,
					reason: 'usage_charge',
					referenceType: 'usage_event',
					referenceId: usageEvent.id,
					idempotencyKey: `usage_charge_${normalizedRequestId}`,
				},
			})
			}

			if (decision.billingSource === 'subscription_included' && decision.subscription?.id) {
				await tx.subscription.update({
					where: { id: decision.subscription.id },
					data: { usedRequests: { increment: 1 } },
				})
			}

			return usageEvent
		})

		return {
			event,
			requestId: normalizedRequestId,
			replayed: false,
		}
	},

	async finalizeCharge({ requestId, inputTokens = 0, outputTokens = 0 }) {
		const usageEvent = await prisma.usageEvent.findUnique({
			where: { requestId },
			include: {
				subscription: {
					include: { plan: true },
				},
			},
		})

		if (!usageEvent) throw new AppError('Usage event not found', 404)
		if (usageEvent.status === 'completed') {
			return usageEvent
		}
		if (usageEvent.status === 'reversed') {
			throw new AppError('Usage event was reversed', 409)
		}

		const updated = await prisma.usageEvent.update({
			where: { id: usageEvent.id },
			data: {
				status: 'completed',
				inputTokens,
				outputTokens,
			},
			include: {
				subscription: {
					include: { plan: true },
				},
			},
		})

		await logBusinessEvent({
			eventType: 'usage.charge',
			actorUserId: updated.userId,
			entityType: 'usage_event',
			entityId: updated.id,
			payload: {
				requestId,
				costMinor: updated.costMinor,
				billingSource: updated.billingSource,
				billingTier: updated.billingTier,
			},
		})

		if (updated.costMinor > 0) {
			await logBusinessEvent({
				eventType: 'balance.changed',
				actorUserId: updated.userId,
				entityType: 'wallet',
				entityId: updated.userId,
				payload: { deltaMinor: -updated.costMinor, reason: 'usage_charge' },
			})
		}

		return updated
	},

	async rollbackCharge({ requestId }) {
		const usageEvent = await prisma.usageEvent.findUnique({ where: { requestId } })
		if (!usageEvent) return null
		if (usageEvent.status === 'reversed') return usageEvent
		if (usageEvent.status === 'completed') {
			throw new AppError('Cannot rollback completed usage event', 409)
		}

		const updated = await prisma.$transaction(tx => rollbackPendingUsageEvent(tx, usageEvent))

		if (usageEvent.costMinor > 0) {
			await logBusinessEvent({
				eventType: 'balance.changed',
				actorUserId: usageEvent.userId,
				entityType: 'wallet',
				entityId: usageEvent.userId,
				payload: { deltaMinor: usageEvent.costMinor, reason: 'usage_charge_refund' },
			})
		}

		return updated
	},

	async charge({ userId, modelProvider, modelName, modelTier = 'basic', inputTokens = 0, outputTokens = 0, requestId }) {
		const begin = await this.beginCharge({
			userId,
			modelProvider,
			modelName,
			modelTier,
			requestId,
		})

		if (begin.event.status === 'completed') {
			return {
				event: begin.event,
				idempotentReplay: true,
			}
		}

		const event = await this.finalizeCharge({
			requestId: begin.requestId,
			inputTokens,
			outputTokens,
		})

		return { event, idempotentReplay: false }
	},
}
