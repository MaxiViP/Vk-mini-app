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

const buildRestores = ({
	aiMemory = '',
	conversation = storedConversation,
	onChat = null,
	onSimpleChat = null,
	onAiMessageCreate = null,
}) => [
	patchMethod(prisma.subscription, 'updateMany', async () => ({ count: 0 })),
	patchMethod(prisma.subscription, 'findFirst', async () => activeAiSubscription),
	patchMethod(prisma.usageEvent, 'groupBy', async () => []),
	patchMethod(prisma.usageEvent, 'create', async data => ({ id: 'usage_prompt', ...data })),
	patchMethod(prisma.aiConversation, 'findUnique', async () => null),
	patchMethod(prisma.aiConversation, 'create', async () => conversation),
	patchMethod(prisma.aiConversation, 'update', async ({ data }) => ({ ...conversation, ...data })),
	patchMethod(prisma.aiMessage, 'create', async data => {
		onAiMessageCreate?.(data)
		return { id: 'ai_msg_prompt', ...data }
	}),
	patchMethod(workspaceService, 'getAiMemory', async () => ({ aiMemory })),
	...(onChat
		? [
				patchMethod(aiClient, 'chat', async payload => {
					onChat(payload)
					return {
						reply: 'ok',
						user_id: 'prompt-user',
						conversation_id: payload.conversationId,
					}
				}),
			]
		: []),
	...(onSimpleChat
		? [
				patchMethod(aiClient, 'simpleChat', async payload => {
					onSimpleChat(payload)
					return {
						reply: 'ok',
					}
				}),
			]
		: []),
]

export const cases = [
	{
		name: 'aiService context mode includes AI memory when session context is empty',
		run: async () => {
			let capturedMessage = null
			const restores = buildRestores({
				aiMemory: 'memory',
				onChat: ({ message }) => {
					capturedMessage = message
				},
			})

			try {
				aiService.syncAiMemoryCache('prompt-user', 'memory')

				await aiService.sendChat({
					userId: 'prompt-user',
					conversationId: 'conv-prompt',
					message: 'question',
					sessionContext: '',
				})

				assert.equal(capturedMessage, 'ИНСТРУКЦИЯ:\nmemory\n\nВОПРОС:\nquestion')
				assert.equal(capturedMessage.includes('КОНТЕКСТ:'), false)
			} finally {
				restoreAll(restores)
			}
		},
	},
	{
		name: 'aiService context mode includes session context when AI memory is empty',
		run: async () => {
			let capturedMessage = null
			const restores = buildRestores({
				aiMemory: '',
				onChat: ({ message }) => {
					capturedMessage = message
				},
			})

			try {
				aiService.syncAiMemoryCache('prompt-user', '')

				await aiService.sendChat({
					userId: 'prompt-user',
					conversationId: 'conv-prompt',
					message: 'question',
					sessionContext: 'context',
				})

				assert.equal(capturedMessage, 'КОНТЕКСТ:\ncontext\n\nВОПРОС:\nquestion')
				assert.equal(capturedMessage.includes('ИНСТРУКЦИЯ:'), false)
			} finally {
				restoreAll(restores)
			}
		},
	},
	{
		name: 'aiService context mode combines AI memory and session context before user message',
		run: async () => {
			let capturedMessage = null
			const restores = buildRestores({
				aiMemory: 'memory',
				onChat: ({ message }) => {
					capturedMessage = message
				},
			})

			try {
				aiService.syncAiMemoryCache('prompt-user', 'memory')

				await aiService.sendChat({
					userId: 'prompt-user',
					conversationId: 'conv-prompt',
					message: 'question',
					sessionContext: 'context',
				})

				assert.equal(capturedMessage, 'ИНСТРУКЦИЯ:\nmemory\n\nКОНТЕКСТ:\ncontext\n\nВОПРОС:\nquestion')
				assert.equal(capturedMessage.includes('\n\n\n'), false)
			} finally {
				restoreAll(restores)
			}
		},
	},
	{
		name: 'aiService simple mode ignores session context and keeps AI memory',
		run: async () => {
			let capturedMessage = null
			const restores = buildRestores({
				aiMemory: 'memory that should be used',
				conversation: {
					...storedConversation,
					conversationKey: 'aivk-simple-prompt-user',
					mode: 'simple',
				},
				onSimpleChat: ({ message }) => {
					capturedMessage = message
				},
			})

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
				assert.equal(capturedMessage.includes('КОНТЕКСТ:'), false)
			} finally {
				restoreAll(restores)
			}
		},
	},
	{
		name: 'aiService does not persist session context in DB-backed message history',
		run: async () => {
			let capturedMessage = null
			const persistedMessages = []
			const restores = buildRestores({
				aiMemory: 'memory',
				onChat: ({ message }) => {
					capturedMessage = message
				},
				onAiMessageCreate: payload => {
					persistedMessages.push(payload)
				},
			})

			try {
				aiService.syncAiMemoryCache('prompt-user', 'memory')

				await aiService.sendChat({
					userId: 'prompt-user',
					conversationId: 'conv-prompt',
					message: 'question',
					sessionContext: 'temporary context',
				})

				assert.equal(capturedMessage, 'ИНСТРУКЦИЯ:\nmemory\n\nКОНТЕКСТ:\ntemporary context\n\nВОПРОС:\nquestion')
				assert.equal(persistedMessages.length, 2)
				assert.equal(persistedMessages[0].data.content, 'question')
				assert.equal(persistedMessages[1].data.content, 'ok')
				assert.equal(JSON.stringify(persistedMessages).includes('temporary context'), false)
				assert.equal(JSON.stringify(persistedMessages).includes('КОНТЕКСТ:'), false)
			} finally {
				restoreAll(restores)
			}
		},
	},
]
