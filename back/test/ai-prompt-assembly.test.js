import assert from 'node:assert/strict'

import prisma from '../src/db/prisma.js'
import { aiClient } from '../src/modules/ai/ai.client.js'
import { aiService } from '../src/modules/ai/ai.service.js'
import { workspaceService } from '../src/modules/workspace/workspace.service.js'
import { patchMethod, restoreAll } from './helpers/patch.js'

const activeAiSubscription = {
	id: 'sub_ai_prompt',
	userId: 'prompt-user',
	status: 'active',
	periodStart: new Date('2026-04-01T00:00:00.000Z'),
	periodEnd: new Date('2026-05-01T00:00:00.000Z'),
	cancelAtPeriodEnd: false,
	createdAt: new Date('2026-04-01T00:00:00.000Z'),
	plan: {
		id: 'plan_ai_prompt',
		code: 'ai-start',
		name: 'AI Start',
		productType: 'ai',
		priceMinor: 29900,
		intervalDays: 30,
		includedRequests: 0,
		accessTier: 'basic',
		aiChatLimit: 10,
		aiVoiceLimit: 1,
		aiFileUploadLimit: 1,
		isActive: true,
	},
}

export const cases = [
	{
		name: 'aiService prompt assembly preserves block order and joins with double newlines',
		run: async () => {
			let capturedMessage = null

			const restores = [
				patchMethod(prisma.subscription, 'updateMany', async () => ({ count: 0 })),
				patchMethod(prisma.subscription, 'findFirst', async () => activeAiSubscription),
				patchMethod(prisma.usageEvent, 'groupBy', async () => []),
				patchMethod(prisma.usageEvent, 'create', async data => ({ id: 'usage_prompt', ...data })),
				patchMethod(workspaceService, 'getAiMemory', async () => ({ aiMemory: 'memory' })),
				patchMethod(aiClient, 'chat', async ({ message }) => {
					capturedMessage = message
					return {
						reply: 'ok',
						user_id: 'prompt-user',
						conversation_id: 'conv-prompt',
					}
				}),
			]

			try {
				await aiService.sendChat({
					userId: 'prompt-user',
					conversationId: 'conv-prompt',
					message: 'question',
					sessionContext: 'context',
				})

				assert.equal(
					capturedMessage,
					'ИНСТРУКЦИЯ:\nmemory\n\nКОНТЕКСТ:\ncontext\n\nВОПРОС:\nquestion',
				)
				assert.equal(capturedMessage.includes('\n\n\n'), false)
			} finally {
				restoreAll(restores)
			}
		},
	},
	{
		name: 'aiService simple mode sends raw message without prompt assembly',
		run: async () => {
			let capturedMessage = null

			const restores = [
				patchMethod(prisma.subscription, 'updateMany', async () => ({ count: 0 })),
				patchMethod(prisma.subscription, 'findFirst', async () => activeAiSubscription),
				patchMethod(prisma.usageEvent, 'groupBy', async () => []),
				patchMethod(prisma.usageEvent, 'create', async data => ({ id: 'usage_simple_prompt', ...data })),
				patchMethod(workspaceService, 'getAiMemory', async () => ({ aiMemory: 'memory that should not be used' })),
				patchMethod(aiClient, 'simpleChat', async ({ message }) => {
					capturedMessage = message
					return {
						reply: 'ok',
					}
				}),
			]

			try {
				await aiService.sendChat({
					userId: 'prompt-user',
					conversationId: 'conv-prompt',
					message: 'question',
					sessionContext: 'context',
					mode: 'simple',
				})

				assert.equal(capturedMessage, 'question')
			} finally {
				restoreAll(restores)
			}
		},
	},
]
