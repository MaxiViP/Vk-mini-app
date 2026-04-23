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

const storedConversation = {
	id: 'ai_conv_prompt',
	userId: 'prompt-user',
	conversationKey: 'conv-prompt',
	title: 'question',
	provider: 'aivk',
	mode: 'context',
	status: 'active',
	source: 'vk_ai',
	messageCount: 0,
	lastMessageAt: null,
	createdAt: new Date('2026-04-01T00:00:00.000Z'),
	updatedAt: new Date('2026-04-01T00:00:00.000Z'),
}

export const cases = [
	{
		name: 'aiService prompt assembly keeps only AI memory before the user message',
		run: async () => {
			let capturedMessage = null

			const restores = [
				patchMethod(prisma.subscription, 'updateMany', async () => ({ count: 0 })),
				patchMethod(prisma.subscription, 'findFirst', async () => activeAiSubscription),
				patchMethod(prisma.usageEvent, 'groupBy', async () => []),
				patchMethod(prisma.usageEvent, 'create', async data => ({ id: 'usage_prompt', ...data })),
				patchMethod(prisma.aiConversation, 'findUnique', async () => null),
				patchMethod(prisma.aiConversation, 'create', async () => storedConversation),
				patchMethod(prisma.aiConversation, 'update', async ({ data }) => ({ ...storedConversation, ...data })),
				patchMethod(prisma.aiMessage, 'create', async data => ({ id: 'ai_msg_prompt', ...data })),
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
				aiService.syncAiMemoryCache('prompt-user', 'memory')

				await aiService.sendChat({
					userId: 'prompt-user',
					conversationId: 'conv-prompt',
					message: 'question',
					sessionContext: 'context',
				})

				assert.equal(capturedMessage, 'ИНСТРУКЦИЯ:\nmemory\n\nВОПРОС:\nquestion')
				assert.equal(capturedMessage.includes('\n\n\n'), false)
			} finally {
				restoreAll(restores)
			}
		},
	},
	{
		name: 'aiService simple mode prepends AI memory before user message',
		run: async () => {
			let capturedMessage = null

			const restores = [
				patchMethod(prisma.subscription, 'updateMany', async () => ({ count: 0 })),
				patchMethod(prisma.subscription, 'findFirst', async () => activeAiSubscription),
				patchMethod(prisma.usageEvent, 'groupBy', async () => []),
				patchMethod(prisma.usageEvent, 'create', async data => ({ id: 'usage_simple_prompt', ...data })),
				patchMethod(prisma.aiConversation, 'findUnique', async () => null),
				patchMethod(prisma.aiConversation, 'create', async () => ({
					...storedConversation,
					conversationKey: 'aivk-simple-prompt-user',
					mode: 'simple',
				})),
				patchMethod(prisma.aiConversation, 'update', async ({ data }) => ({ ...storedConversation, ...data })),
				patchMethod(prisma.aiMessage, 'create', async data => ({ id: 'ai_msg_simple_prompt', ...data })),
				patchMethod(workspaceService, 'getAiMemory', async () => ({ aiMemory: 'memory that should be used' })),
				patchMethod(aiClient, 'simpleChat', async ({ message }) => {
					capturedMessage = message
					return {
						reply: 'ok',
					}
				}),
			]

			try {
				aiService.syncAiMemoryCache('prompt-user', 'memory that should be used')

				await aiService.sendChat({
					userId: 'prompt-user',
					conversationId: 'conv-prompt',
					message: 'question',
					sessionContext: 'context',
					mode: 'simple',
				})

				assert.equal(capturedMessage, 'ИНСТРУКЦИЯ:\nmemory that should be used\n\nВОПРОС:\nquestion')
			} finally {
				restoreAll(restores)
			}
		},
	},
]
