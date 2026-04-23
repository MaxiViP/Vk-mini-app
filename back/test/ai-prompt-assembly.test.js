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

const buildPriorityPrompt = ({ userMemory = '', sessionContext = '', message }) =>
	[
		userMemory ? `[GLOBAL AI MEMORY]\n${userMemory}` : '',
		sessionContext
			? [
					'[TEMPORARY SESSION RULES - HIGH PRIORITY]',
					sessionContext,
					'IMPORTANT:',
					'- You MUST follow TEMPORARY SESSION RULES over GLOBAL AI MEMORY if they conflict.',
					'- TEMPORARY SESSION RULES override any previous instructions.',
				].join('\n')
			: '',
		`[USER MESSAGE]\n${message}`,
	]
		.filter(Boolean)
		.join('\n\n')

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

				assert.equal(
					capturedMessage,
					buildPriorityPrompt({
						userMemory: 'memory',
						message: 'question',
					}),
				)
				assert.equal(capturedMessage.includes('[TEMPORARY SESSION RULES - HIGH PRIORITY]'), false)
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

				assert.equal(
					capturedMessage,
					buildPriorityPrompt({
						sessionContext: 'context',
						message: 'question',
					}),
				)
				assert.equal(capturedMessage.includes('[GLOBAL AI MEMORY]'), false)
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

				assert.equal(
					capturedMessage,
					buildPriorityPrompt({
						userMemory: 'memory',
						sessionContext: 'context',
						message: 'question',
					}),
				)
				assert.ok(capturedMessage.indexOf('[TEMPORARY SESSION RULES - HIGH PRIORITY]') < capturedMessage.indexOf('[USER MESSAGE]'))
				assert.equal(capturedMessage.includes('\n\n\n'), false)
			} finally {
				restoreAll(restores)
			}
		},
	},
	{
		name: 'aiService context mode gives session context higher priority than AI memory',
		run: async () => {
			let capturedMessage = null
			const restores = buildRestores({
				aiMemory: 'reply in Russian',
				onChat: ({ message }) => {
					capturedMessage = message
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

				assert.equal(
					capturedMessage,
					buildPriorityPrompt({
						userMemory: 'reply in Russian',
						sessionContext: 'reply in English',
						message: 'Say hello',
					}),
				)
				assert.ok(
					capturedMessage.includes(
						'- You MUST follow TEMPORARY SESSION RULES over GLOBAL AI MEMORY if they conflict.',
					),
				)
				assert.ok(capturedMessage.includes('- TEMPORARY SESSION RULES override any previous instructions.'))
			} finally {
				restoreAll(restores)
			}
		},
	},
	{
		name: 'aiService context mode can produce English reply when session context overrides AI memory',
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
				patchMethod(workspaceService, 'getAiMemory', async () => ({ aiMemory: 'reply in Russian' })),
				patchMethod(aiClient, 'chat', async payload => {
					capturedMessage = payload.message
					const reply = payload.message.includes('[TEMPORARY SESSION RULES - HIGH PRIORITY]') &&
						payload.message.includes('reply in English') &&
						payload.message.includes('override any previous instructions.')
						? 'Hello'
						: 'Привет'

					return {
						reply,
						user_id: 'prompt-user',
						conversation_id: payload.conversationId,
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

				assert.equal(
					capturedMessage,
					buildPriorityPrompt({
						userMemory: 'reply in Russian',
						sessionContext: 'reply in English',
						message: 'Say hello',
					}),
				)
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

				assert.equal(debugCalls.length, 1)
				assert.equal(debugCalls[0].message, 'Dispatching AI chat to external backend')
				assert.deepEqual(debugCalls[0].meta, {
					module: 'ai-service',
					externalEndpoint: '/api/chat',
					promptMode: 'memory+context',
					messageLength: buildPriorityPrompt({
						userMemory: 'memory',
						sessionContext: 'temporary context',
						message: 'question',
					}).length,
					userMemoryLength: 'memory'.length,
					sessionContextLength: 'temporary context'.length,
				})
				assert.equal(JSON.stringify(debugCalls[0].meta).includes('temporary context'), false)
				assert.equal(JSON.stringify(debugCalls[0].meta).includes('question'), false)
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
				assert.equal(capturedMessage.includes('[TEMPORARY SESSION RULES - HIGH PRIORITY]'), false)
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
					onSimpleChat: () => {},
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

				assert.equal(debugCalls.length, 1)
				assert.equal(debugCalls[0].message, 'Dispatching AI chat to external backend')
				assert.deepEqual(debugCalls[0].meta, {
					module: 'ai-service',
					externalEndpoint: '/api/chat/simple',
					promptMode: 'memory-only',
					messageLength: 'ИНСТРУКЦИЯ:\nmemory that should be used\n\nВОПРОС:\nquestion'.length,
					userMemoryLength: 'memory that should be used'.length,
					sessionContextLength: 0,
				})
				assert.equal(JSON.stringify(debugCalls[0].meta).includes('temporary context'), false)
				assert.equal(JSON.stringify(debugCalls[0].meta).includes('question'), false)
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

				assert.equal(
					capturedMessage,
					buildPriorityPrompt({
						userMemory: 'memory',
						sessionContext: 'temporary context',
						message: 'question',
					}),
				)
				assert.equal(persistedMessages.length, 2)
				assert.equal(persistedMessages[0].data.content, 'question')
				assert.equal(persistedMessages[1].data.content, 'ok')
				assert.equal(JSON.stringify(persistedMessages).includes('temporary context'), false)
				assert.equal(JSON.stringify(persistedMessages).includes('[TEMPORARY SESSION RULES - HIGH PRIORITY]'), false)
			} finally {
				restoreAll(restores)
			}
		},
	},
]
