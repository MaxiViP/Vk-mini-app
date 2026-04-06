import crypto from 'node:crypto'

import prisma from '../../db/prisma.js'
import { AppError } from '../../shared/errors.js'
import { logBusinessEvent } from '../../shared/observability.js'

const calcMinorCost = ({ inputTokens = 0, outputTokens = 0 }) =>
	Math.max(1, Math.round((inputTokens + outputTokens) * 0.02))

export const usageService = {
	async getUsage(userId) {
		const events = await prisma.usageEvent.findMany({
			where: { userId },
			orderBy: { createdAt: 'desc' },
			take: 50,
		})

		const summary = events.reduce(
			(acc, item) => {
				acc.requests += 1
				acc.inputTokens += item.inputTokens
				acc.outputTokens += item.outputTokens
				acc.costMinor += item.costMinor
				return acc
			},
			{ requests: 0, inputTokens: 0, outputTokens: 0, costMinor: 0 },
		)

		return { userId, summary, events }
	},

	async charge({ userId, modelProvider, modelName, inputTokens = 0, outputTokens = 0, requestId }) {
		if (!modelProvider || !modelName) throw new AppError('modelProvider and modelName are required', 400)

		const normalizedRequestId = requestId || crypto.randomUUID()
		const existingEvent = await prisma.usageEvent.findUnique({ where: { requestId: normalizedRequestId } })
		if (existingEvent) {
			return {
				event: existingEvent,
				wallet: await prisma.wallet.findUnique({ where: { userId } }),
				idempotentReplay: true,
			}
		}

		const costMinor = calcMinorCost({ inputTokens, outputTokens })

		const result = await prisma.$transaction(async tx => {
			const wallet = await tx.wallet.upsert({
				where: { userId },
				update: {},
				create: { userId, balanceMinor: 0, currency: 'RUB' },
			})

			if (wallet.balanceMinor < costMinor) {
				throw new AppError('Insufficient balance', 402)
			}

			const event = await tx.usageEvent.create({
				data: {
					userId,
					modelProvider,
					modelName,
					inputTokens,
					outputTokens,
					costMinor,
					requestId: normalizedRequestId,
				},
			})

			const updatedWallet = await tx.wallet.update({
				where: { userId },
				data: { balanceMinor: { decrement: costMinor } },
			})

			await tx.walletLedger.create({
				data: {
					userId,
					type: 'debit',
					amountMinor: costMinor,
					reason: 'usage_charge',
					referenceType: 'usage_event',
					referenceId: event.id,
					idempotencyKey: `usage_charge_${normalizedRequestId}`,
				},
			})

			return { event, wallet: updatedWallet }
		})

		await logBusinessEvent({
			eventType: 'usage.charge',
			actorUserId: userId,
			entityType: 'usage_event',
			entityId: result.event.id,
			payload: { costMinor, modelProvider, modelName, requestId: normalizedRequestId },
		})
		await logBusinessEvent({
			eventType: 'balance.changed',
			actorUserId: userId,
			entityType: 'wallet',
			entityId: userId,
			payload: { deltaMinor: -costMinor, reason: 'usage_charge' },
		})

		return result
	},
}
