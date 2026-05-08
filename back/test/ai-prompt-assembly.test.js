import assert from 'node:assert/strict'

import logger from '../src/config/logger.js'
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
	externalUserId = 'vk-prompt-user',
}) => [
	patchMethod(prisma.subscription, 'updateMany', async () => ({ count: 0 })),
	patchMethod(prisma.subscription, 'findFirst', async () => activeAiSubscription),
	patchMethod(prisma.usageEvent, 'groupBy', async () => []),
	patchMethod(prisma.usageEvent, 'create', async data => ({ id: 'usage_prompt', ...data })),
	patchMethod(prisma.authIdentity, 'findFirst', async () =>
		externalUserId ? { providerUserId: externalUserId } : null,
	),
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
						user_id: payload.externalUserId,
						conversation_id: `vk_${payload.externalUserId}_default`,
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
		name: 'aiService context mode sends clean user message without AI memory fields',
		run: async () => {
			let capturedPayload = null
			const restores = buildRestores({
				aiMemory: 'memory',
				onChat: payload => {
					capturedPayload = payload
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

				assert.equal(capturedPayload.message, 'question')
				assert.equal(capturedPayload.externalUserId, 'vk-prompt-user')
				assert.equal(Object.hasOwn(capturedPayload, 'userMemory'), false)
				assert.equal(Object.hasOwn(capturedPayload, 'sessionContext'), false)
				assert.equal(capturedPayload.message.includes('[GLOBAL AI MEMORY]'), false)
				assert.equal(capturedPayload.message.includes('[TEMPORARY SESSION RULES - HIGH PRIORITY]'), false)
			} finally {
				restoreAll(restores)
			}
		},
	},
	{
		name: 'aiService context mode does not forward session context fields',
		run: async () => {
			let capturedPayload = null
			const restores = buildRestores({
				aiMemory: '',
				onChat: payload => {
					capturedPayload = payload
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

				assert.equal(capturedPayload.message, 'question')
				assert.equal(capturedPayload.externalUserId, 'vk-prompt-user')
				assert.equal(Object.hasOwn(capturedPayload, 'userMemory'), false)
				assert.equal(Object.hasOwn(capturedPayload, 'sessionContext'), false)
				assert.equal(capturedPayload.message.includes('[GLOBAL AI MEMORY]'), false)
				assert.equal(capturedPayload.message.includes('[TEMPORARY SESSION RULES - HIGH PRIORITY]'), false)
			} finally {
				restoreAll(restores)
			}
		},
	},
	{
		name: 'aiService context mode keeps legacy memory/context out of upstream message',
		run: async () => {
			let capturedPayload = null
			const restores = buildRestores({
				aiMemory: 'memory',
				onChat: payload => {
					capturedPayload = payload
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

				assert.equal(capturedPayload.message, 'question')
				assert.equal(capturedPayload.externalUserId, 'vk-prompt-user')
				assert.equal(Object.hasOwn(capturedPayload, 'userMemory'), false)
				assert.equal(Object.hasOwn(capturedPayload, 'sessionContext'), false)
				assert.equal(capturedPayload.message.includes('memory'), false)
				assert.equal(capturedPayload.message.includes('context'), false)
			} finally {
				restoreAll(restores)
			}
		},
	},
	{
		name: 'aiService context mode ignores legacy memory/context transport fields',
		run: async () => {
			let capturedPayload = null
			const restores = buildRestores({
				aiMemory: 'reply in Russian',
				onChat: payload => {
					capturedPayload = payload
				},
			})

			try {
				aiService.syncAiMemoryCache('prompt-user', 'reply in Russian')

				await aiService.sendChat({
					userId: 'prompt-user',
					conversationId: 'conv-prompt',
					message: 'Say hello',
					sessionContext: 'reply in English',
				})

				assert.equal(capturedPayload.message, 'Say hello')
				assert.equal(capturedPayload.externalUserId, 'vk-prompt-user')
				assert.equal(Object.hasOwn(capturedPayload, 'userMemory'), false)
				assert.equal(Object.hasOwn(capturedPayload, 'sessionContext'), false)
			} finally {
				restoreAll(restores)
			}
		},
	},
	{
		name: 'aiService context mode preserves upstream response fields',
		run: async () => {
			let capturedPayload = null
			const restores = [
				patchMethod(prisma.subscription, 'updateMany', async () => ({ count: 0 })),
				patchMethod(prisma.subscription, 'findFirst', async () => activeAiSubscription),
				patchMethod(prisma.usageEvent, 'groupBy', async () => []),
				patchMethod(prisma.usageEvent, 'create', async data => ({ id: 'usage_prompt', ...data })),
				patchMethod(prisma.authIdentity, 'findFirst', async () => ({ providerUserId: 'vk-prompt-user' })),
				patchMethod(prisma.aiConversation, 'findUnique', async () => null),
				patchMethod(prisma.aiConversation, 'create', async () => storedConversation),
				patchMethod(prisma.aiConversation, 'update', async ({ data }) => ({ ...storedConversation, ...data })),
				patchMethod(prisma.aiMessage, 'create', async data => ({ id: 'ai_msg_prompt', ...data })),
				patchMethod(workspaceService, 'getAiMemory', async () => ({ aiMemory: 'reply in Russian' })),
				patchMethod(aiClient, 'chat', async payload => {
					capturedPayload = payload
					const reply =
						payload.externalUserId === 'vk-prompt-user' && payload.message === 'Say hello'
							? 'Hello'
						: 'Привет'

					return {
						reply,
						user_id: payload.externalUserId,
						conversation_id: `vk_${payload.externalUserId}_default`,
					}
				}),
			]

			try {
				aiService.syncAiMemoryCache('prompt-user', 'reply in Russian')

				const response = await aiService.sendChat({
					userId: 'prompt-user',
					conversationId: 'conv-prompt',
					message: 'Say hello',
					sessionContext: 'reply in English',
				})

				assert.equal(capturedPayload.message, 'Say hello')
				assert.equal(capturedPayload.externalUserId, 'vk-prompt-user')
				assert.equal(Object.hasOwn(capturedPayload, 'userMemory'), false)
				assert.equal(Object.hasOwn(capturedPayload, 'sessionContext'), false)
				assert.equal(response.reply, 'Hello')
			} finally {
				restoreAll(restores)
			}
		},
	},
	{
		name: 'aiService logs sanitized outbound diagnostics for context mode',
		run: async () => {
			const debugCalls = []
			const restores = [
				...buildRestores({
					aiMemory: 'memory',
					onChat: () => {},
				}),
				patchMethod(logger, 'debug', (message, meta) => {
					debugCalls.push({ message, meta })
				}),
			]

			try {
				aiService.syncAiMemoryCache('prompt-user', 'memory')

				await aiService.sendChat({
					userId: 'prompt-user',
					conversationId: 'conv-prompt',
					message: 'question',
					sessionContext: 'temporary context',
				})

				const dispatchCall = debugCalls.find(call => call.message === 'Dispatching AI chat to external backend')
				assert.ok(dispatchCall)
				assert.deepEqual(dispatchCall.meta, {
					module: 'ai-service',
					externalEndpoint: '/v1/chat/messages',
					localConversationId: 'conv-prompt',
					expectedExternalConversationId: 'vk_vk-prompt-user_default',
					messageLength: 'question'.length,
					sessionContextLength: 'temporary context'.length,
					mode: 'context',
				})
				assert.equal(JSON.stringify(dispatchCall.meta).includes('temporary context'), false)
				assert.equal(JSON.stringify(dispatchCall.meta).includes('question'), false)
			} finally {
				restoreAll(restores)
			}
		},
	},
	{
		name: 'aiService simple mode sends clean user message',
		run: async () => {
			let capturedPayload = null
			const restores = buildRestores({
				aiMemory: 'memory that should be used',
				conversation: {
					...storedConversation,
					conversationKey: 'aivk-simple-prompt-user',
					mode: 'simple',
				},
				onChat: payload => {
					capturedPayload = payload
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

				assert.equal(capturedPayload.message, 'question')
				assert.equal(capturedPayload.externalUserId, 'vk-prompt-user')
				assert.equal(Object.hasOwn(capturedPayload, 'userMemory'), false)
				assert.equal(Object.hasOwn(capturedPayload, 'sessionContext'), false)
				assert.equal(capturedPayload.message.includes('[TEMPORARY SESSION RULES - HIGH PRIORITY]'), false)
			} finally {
				restoreAll(restores)
			}
		},
	},
	{
		name: 'aiService logs sanitized outbound diagnostics for simple mode',
		run: async () => {
			const debugCalls = []
			const restores = [
				...buildRestores({
					aiMemory: 'memory that should be used',
					conversation: {
						...storedConversation,
						conversationKey: 'aivk-simple-prompt-user',
						mode: 'simple',
					},
					onChat: () => {},
				}),
				patchMethod(logger, 'debug', (message, meta) => {
					debugCalls.push({ message, meta })
				}),
			]

			try {
				aiService.syncAiMemoryCache('prompt-user', 'memory that should be used')

				await aiService.sendChat({
					userId: 'prompt-user',
					conversationId: 'conv-prompt',
					message: 'question',
					sessionContext: 'temporary context',
					mode: 'simple',
				})

				const dispatchCall = debugCalls.find(call => call.message === 'Dispatching AI chat to external backend')
				assert.ok(dispatchCall)
				assert.deepEqual(dispatchCall.meta, {
					module: 'ai-service',
					externalEndpoint: '/v1/chat/messages',
					localConversationId: 'conv-prompt',
					expectedExternalConversationId: 'vk_vk-prompt-user_default',
					messageLength: 'question'.length,
					sessionContextLength: 0,
					mode: 'simple',
				})
				assert.equal(JSON.stringify(dispatchCall.meta).includes('temporary context'), false)
				assert.equal(JSON.stringify(dispatchCall.meta).includes('question'), false)
			} finally {
				restoreAll(restores)
			}
		},
	},
	{
		name: 'aiService persists clean local chat messages without legacy memory/context',
		run: async () => {
			let capturedPayload = null
			const persistedMessages = []
			const restores = buildRestores({
				aiMemory: 'memory',
				onChat: payload => {
					capturedPayload = payload
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

				assert.equal(capturedPayload.message, 'question')
				assert.equal(capturedPayload.externalUserId, 'vk-prompt-user')
				assert.equal(Object.hasOwn(capturedPayload, 'userMemory'), false)
				assert.equal(Object.hasOwn(capturedPayload, 'sessionContext'), false)
				assert.equal(persistedMessages.length, 2)
				assert.equal(JSON.stringify(persistedMessages).includes('temporary context'), false)
				assert.equal(JSON.stringify(persistedMessages).includes('memory'), false)
				assert.equal(JSON.stringify(persistedMessages).includes('[TEMPORARY SESSION RULES - HIGH PRIORITY]'), false)
			} finally {
				restoreAll(restores)
			}
		},
	},
]
