import assert from 'node:assert/strict'

import env from '../src/config/env.js'
import prisma from '../src/db/prisma.js'
import { aiClient } from '../src/modules/ai/ai.client.js'
import { aiService } from '../src/modules/ai/ai.service.js'
import { workspaceService } from '../src/modules/workspace/workspace.service.js'
import { startTestServer, stopTestServer, createAccessToken } from './helpers/http.js'
import { patchMethod, patchValue, restoreAll } from './helpers/patch.js'

const activeAiSubscription = {
	id: 'sub_ai_1',
	userId: 'test-user',
	status: 'active',
	periodStart: new Date(Date.now() - 24 * 60 * 60 * 1000),
	periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
	cancelAtPeriodEnd: false,
	createdAt: new Date('2026-04-01T00:00:00.000Z'),
	plan: {
		id: 'plan_ai_1',
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

const expiredAiSubscription = {
	...activeAiSubscription,
	id: 'sub_ai_expired',
	status: 'expired',
	periodEnd: new Date(Date.now() - 24 * 60 * 60 * 1000),
	endedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
	plan: {
		...activeAiSubscription.plan,
		id: 'plan_ai_pro',
		code: 'ai-pro',
		name: 'AI Pro',
		accessTier: 'premium',
		aiChatLimit: 1500,
		aiVoiceLimit: 150,
		aiFileUploadLimit: 100,
	},
}

const storedConversation = {
	id: 'ai_conv_1',
	userId: 'test-user',
	conversationKey: 'conv-with-access',
	title: 'hello',
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
		name: 'POST /api/ai/chat returns controlled error when AI access is missing',
		run: async () => {
			const restores = [
				patchMethod(prisma.subscription, 'updateMany', async () => ({ count: 0 })),
				patchMethod(prisma.subscription, 'findFirst', async () => null),
			]

			const token = createAccessToken()
			const { server, baseUrl } = await startTestServer()

			try {
				const response = await fetch(`${baseUrl}/api/ai/chat`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${token}`,
					},
					body: JSON.stringify({
						conversationId: 'conv-no-access',
						message: 'hello',
					}),
				})
				const payload = await response.json()

				assert.equal(response.status, 403)
				assert.equal(payload.message, 'AI subscription is required')
				assert.equal(payload.details?.code, 'AI_SUBSCRIPTION_REQUIRED')
			} finally {
				restoreAll(restores)
				await stopTestServer(server)
			}
		},
	},
	{
		name: 'GET /api/ai/access returns zero AI limits for expired subscription',
		run: async () => {
			let usageSnapshotRead = false
			const restores = [
				patchMethod(prisma.subscription, 'updateMany', async () => ({ count: 0 })),
				patchMethod(prisma.subscription, 'findFirst', async args => {
					if (args?.where?.status) return null
					return expiredAiSubscription
				}),
				patchMethod(prisma.usageEvent, 'groupBy', async () => {
					usageSnapshotRead = true
					return []
				}),
			]

			const token = createAccessToken()
			const { server, baseUrl } = await startTestServer()

			try {
				const response = await fetch(`${baseUrl}/api/ai/access`, {
					headers: {
						Authorization: `Bearer ${token}`,
					},
				})
				const payload = await response.json()

				assert.equal(response.status, 200)
				assert.equal(payload.hasAccess, false)
				assert.equal(payload.subscription?.status, 'expired')
				assert.equal(payload.plan, null)
				assert.deepEqual(payload.limits, { chat: 0, voice: 0, fileUpload: 0 })
				assert.deepEqual(payload.usage, { chat: 0, voice: 0, fileUpload: 0 })
				assert.deepEqual(payload.remaining, { chat: 0, voice: 0, fileUpload: 0 })
				assert.deepEqual(payload.capabilities, { chat: false, voice: false, fileUpload: false })
				assert.equal(usageSnapshotRead, false)
			} finally {
				restoreAll(restores)
				await stopTestServer(server)
			}
		},
	},
	{
		name: 'POST /api/ai/chat proxies clean message with resolved VK external user id',
		run: async () => {
			let capturedChatPayload = null
			const restores = [
				patchValue(env, 'vkAiProfileId', 'fast_chat'),
				patchValue(env, 'vkAiBillingMode', 'auto'),
				patchMethod(prisma.subscription, 'updateMany', async () => ({ count: 0 })),
				patchMethod(prisma.subscription, 'findFirst', async () => activeAiSubscription),
				patchMethod(prisma.usageEvent, 'groupBy', async () => []),
				patchMethod(prisma.usageEvent, 'create', async data => ({ id: 'usage_1', ...data })),
				patchMethod(prisma.authIdentity, 'findFirst', async () => ({ providerUserId: 'vk-test-user' })),
				patchMethod(prisma.aiConversation, 'findUnique', async () => null),
				patchMethod(prisma.aiConversation, 'create', async () => storedConversation),
				patchMethod(prisma.aiConversation, 'update', async ({ data }) => ({ ...storedConversation, ...data })),
				patchMethod(prisma.aiMessage, 'create', async data => ({ id: 'ai_msg_1', ...data })),
				patchMethod(workspaceService, 'getAiMemory', async () => ({ aiMemory: 'persistent memory' })),
				patchMethod(aiClient, 'chat', async payload => {
					capturedChatPayload = payload
					return {
						reply: 'AI reply',
						user_id: payload.externalUserId,
						conversation_id: payload.conversationId,
						upstream_message: payload.message,
						upstream_external_user_id: payload.externalUserId,
						upstream_user_id: payload.userId,
						upstream_conversation_id: payload.conversationId,
						upstream_metadata: payload.metadata,
						upstream_has_idempotency_key: Boolean(payload.idempotencyKey),
						upstream_has_user_memory: Object.hasOwn(payload, 'userMemory'),
						upstream_has_session_context: Object.hasOwn(payload, 'sessionContext'),
					}
				}),
			]

			const token = createAccessToken()
			const { server, baseUrl } = await startTestServer()

			try {
				const response = await fetch(`${baseUrl}/api/ai/chat`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${token}`,
					},
					body: JSON.stringify({
						conversationId: 'conv-with-access',
						message: 'hello',
						sessionContext: 'current task',
					}),
				})
				const payload = await response.json()

				assert.equal(response.status, 200)
				assert.equal(payload.reply, 'AI reply')
				assert.equal(payload.conversation_id, 'vk_vk-test-user_default')
				assert.equal(payload.upstream_message, 'hello')
				assert.equal(payload.upstream_external_user_id, 'vk-test-user')
				assert.equal(payload.upstream_user_id, 'vk-test-user')
				assert.equal(payload.upstream_conversation_id, 'vk_vk-test-user_default')
				assert.deepEqual(payload.upstream_metadata, {
					local_user_id: 'test-user',
					local_conversation_id: 'conv-with-access',
					mode: 'context',
				})
				assert.equal(payload.upstream_has_idempotency_key, true)
				assert.equal(payload.upstream_has_user_memory, false)
				assert.equal(payload.upstream_has_session_context, false)
				assert.equal(payload.upstream_message.includes('[TEMPORARY SESSION RULES - HIGH PRIORITY]'), false)
				assert.equal(capturedChatPayload.aiProfileId, 'fast_chat')
				assert.equal(capturedChatPayload.billingMode, 'auto')
			} finally {
				restoreAll(restores)
				await stopTestServer(server)
			}
		},
	},
	{
		name: 'POST /api/ai/chat uses stable conversation id in simple mode',
		run: async () => {
			const restores = [
				patchMethod(prisma.subscription, 'updateMany', async () => ({ count: 0 })),
				patchMethod(prisma.subscription, 'findFirst', async () => activeAiSubscription),
				patchMethod(prisma.usageEvent, 'groupBy', async () => []),
				patchMethod(prisma.usageEvent, 'create', async data => ({ id: 'usage_simple_1', ...data })),
				patchMethod(prisma.authIdentity, 'findFirst', async () => ({ providerUserId: 'vk-test-user' })),
				patchMethod(prisma.aiConversation, 'findUnique', async () => null),
				patchMethod(prisma.aiConversation, 'create', async () => ({
					...storedConversation,
					conversationKey: 'aivk-simple-test-user',
					mode: 'simple',
				})),
				patchMethod(prisma.aiConversation, 'update', async ({ data }) => ({ ...storedConversation, ...data })),
				patchMethod(prisma.aiMessage, 'create', async data => ({ id: 'ai_msg_simple_1', ...data })),
				patchMethod(workspaceService, 'getAiMemory', async () => ({ aiMemory: 'persistent memory' })),
				patchMethod(aiClient, 'chat', async ({ externalUserId, message }) => ({
					reply: `simple:${externalUserId}:${message}`,
				})),
			]

			const token = createAccessToken()
			const { server, baseUrl } = await startTestServer()

			try {
				const response = await fetch(`${baseUrl}/api/ai/chat`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${token}`,
					},
					body: JSON.stringify({
						mode: 'simple',
						conversationId: 'conv-simple',
						message: 'hello-simple',
					}),
				})
				const payload = await response.json()

				assert.equal(response.status, 200)
				assert.equal(payload.reply, 'simple:vk-test-user:hello-simple')
			} finally {
				restoreAll(restores)
				await stopTestServer(server)
			}
		},
	},
	{
		name: 'GET /api/ai/history/:conversationId proxies external AI history',
		run: async () => {
			let capturedHistoryRequest = null
			const restores = [
				patchMethod(prisma.subscription, 'updateMany', async () => ({ count: 0 })),
				patchMethod(prisma.subscription, 'findFirst', async () => activeAiSubscription),
				patchMethod(prisma.usageEvent, 'groupBy', async () => []),
				patchMethod(prisma.authIdentity, 'findFirst', async () => ({ providerUserId: 'vk-test-user' })),
				patchMethod(prisma.aiConversation, 'findFirst', async () => ({
					...storedConversation,
					conversationKey: 'conv-db',
				})),
				patchMethod(prisma.aiMessage, 'findMany', async () => [
					{
						id: 'msg_1',
						role: 'user',
						content: 'hello',
						metadataJson: null,
					},
					{
						id: 'msg_2',
						role: 'assistant',
						content: 'AI reply',
						metadataJson: null,
					},
				]),
				patchMethod(aiClient, 'getConversation', async payload => {
					capturedHistoryRequest = payload
					return {
						user_id: payload.userId,
						conversation_id: payload.conversationId,
						message_count: 2,
						messages: [
							{ role: 'user', content: 'hello' },
							{ role: 'assistant', content: 'AI reply' },
						],
						files: [],
						voice_records: [],
					}
				}),
			]

			const token = createAccessToken()
			const { server, baseUrl } = await startTestServer()

			try {
				const response = await fetch(`${baseUrl}/api/ai/history/conv-db`, {
					headers: {
						Authorization: `Bearer ${token}`,
					},
				})
				const payload = await response.json()

				assert.equal(response.status, 200)
				assert.equal(capturedHistoryRequest.userId, 'vk-test-user')
				assert.equal(capturedHistoryRequest.conversationId, 'vk_vk-test-user_default')
				assert.equal(payload.conversation_id, 'vk_vk-test-user_default')
				assert.equal(payload.local_conversation_id, 'conv-db')
				assert.equal(payload.message_count, 2)
				assert.equal(payload.messages[0].content, 'hello')
				assert.equal(payload.messages[1].content, 'AI reply')
			} finally {
				restoreAll(restores)
				await stopTestServer(server)
			}
		},
	},
	{
		name: 'GET /api/ai/conversations rejects unsupported external list contract',
		run: async () => {
			const restores = [
				patchMethod(prisma.subscription, 'updateMany', async () => ({ count: 0 })),
				patchMethod(prisma.subscription, 'findFirst', async () => activeAiSubscription),
				patchMethod(prisma.usageEvent, 'groupBy', async () => []),
				patchMethod(prisma.aiConversation, 'findMany', async () => [
					{
						...storedConversation,
						conversationKey: 'conv-db',
						messageCount: 2,
						lastMessageAt: new Date('2026-04-02T00:00:00.000Z'),
					},
				]),
			]

			const token = createAccessToken()
			const { server, baseUrl } = await startTestServer()

			try {
				const response = await fetch(`${baseUrl}/api/ai/conversations`, {
					headers: {
						Authorization: `Bearer ${token}`,
					},
				})
				const payload = await response.json()

				assert.equal(response.status, 501)
				assert.equal(payload.details?.code, 'AI_CONVERSATION_LIST_UNSUPPORTED')
			} finally {
				restoreAll(restores)
				await stopTestServer(server)
			}
		},
	},
	{
		name: 'POST /api/ai/history/:conversationId/reset proxies external reset',
		run: async () => {
			let capturedResetRequest = null
			const restores = [
				patchMethod(prisma.subscription, 'updateMany', async () => ({ count: 0 })),
				patchMethod(prisma.subscription, 'findFirst', async () => activeAiSubscription),
				patchMethod(prisma.usageEvent, 'groupBy', async () => []),
				patchMethod(prisma.authIdentity, 'findFirst', async () => ({ providerUserId: 'vk-test-user' })),
				patchMethod(prisma.aiConversation, 'findFirst', async () => ({
					...storedConversation,
					conversationKey: 'conv-db',
				})),
				patchMethod(prisma.aiConversation, 'update', async ({ data }) => ({
					...storedConversation,
					conversationKey: 'conv-db',
					...data,
				})),
				patchMethod(prisma.aiMessage, 'deleteMany', async () => ({ count: 2 })),
				patchMethod(aiClient, 'resetConversation', async payload => {
					capturedResetRequest = payload
					return {
						status: 'ok',
						user_id: payload.userId,
						conversation_id: payload.conversationId,
					}
				}),
			]

			const token = createAccessToken()
			const { server, baseUrl } = await startTestServer()

			try {
				const response = await fetch(`${baseUrl}/api/ai/history/conv-db/reset`, {
					method: 'POST',
					headers: {
						Authorization: `Bearer ${token}`,
					},
				})
				const payload = await response.json()

				assert.equal(response.status, 200)
				assert.equal(payload.status, 'ok')
				assert.equal(capturedResetRequest.userId, 'vk-test-user')
				assert.equal(capturedResetRequest.conversationId, 'vk_vk-test-user_default')
				assert.equal(payload.conversation_id, 'vk_vk-test-user_default')
				assert.equal(payload.local_conversation_id, 'conv-db')
			} finally {
				restoreAll(restores)
				await stopTestServer(server)
			}
		},
	},
	{
		name: 'aiService.uploadFile uses resolved VK external user and conversation ids',
		run: async () => {
			let capturedUploadRequest = null
			const restores = [
				patchMethod(prisma.subscription, 'updateMany', async () => ({ count: 0 })),
				patchMethod(prisma.subscription, 'findFirst', async () => activeAiSubscription),
				patchMethod(prisma.usageEvent, 'groupBy', async () => []),
				patchMethod(prisma.usageEvent, 'create', async data => ({ id: 'usage_upload_1', ...data })),
				patchMethod(prisma.authIdentity, 'findFirst', async () => ({ providerUserId: 'vk-upload-user' })),
				patchMethod(prisma.aiConversation, 'findUnique', async () => null),
				patchMethod(prisma.aiConversation, 'create', async () => ({
					...storedConversation,
					conversationKey: 'vk-dialog-test-user',
				})),
				patchMethod(prisma.aiConversation, 'update', async ({ data }) => ({
					...storedConversation,
					conversationKey: 'vk-dialog-test-user',
					...data,
				})),
				patchMethod(prisma.aiMessage, 'create', async data => ({ id: 'ai_msg_upload_1', ...data })),
				patchMethod(aiClient, 'uploadFile', async payload => {
					capturedUploadRequest = payload
					return {
						status: 'ok',
						user_id: payload.userId,
						conversation_id: payload.conversationId,
						filename: payload.file.name,
					}
				}),
			]

			try {
				const response = await aiService.uploadFile({
					userId: 'test-user',
					conversationId: 'vk-dialog-test-user',
					file: { name: 'context.txt', size: 12, type: 'text/plain' },
				})

				assert.equal(capturedUploadRequest.userId, 'vk-upload-user')
				assert.equal(capturedUploadRequest.conversationId, 'vk_vk-upload-user_default')
				assert.equal(response.user_id, 'vk-upload-user')
				assert.equal(response.conversation_id, 'vk_vk-upload-user_default')
				assert.equal(response.local_conversation_id, 'vk-dialog-test-user')
			} finally {
				restoreAll(restores)
			}
		},
	},
	{
		name: 'aiService.sendVoice uses resolved VK external user and conversation ids',
		run: async () => {
			let capturedVoiceRequest = null
			const restores = [
				patchMethod(prisma.subscription, 'updateMany', async () => ({ count: 0 })),
				patchMethod(prisma.subscription, 'findFirst', async () => activeAiSubscription),
				patchMethod(prisma.usageEvent, 'groupBy', async () => []),
				patchMethod(prisma.usageEvent, 'create', async data => ({ id: 'usage_voice_1', ...data })),
				patchMethod(prisma.authIdentity, 'findFirst', async () => ({ providerUserId: 'vk-voice-user' })),
				patchMethod(prisma.aiConversation, 'findUnique', async () => null),
				patchMethod(prisma.aiConversation, 'create', async () => ({
					...storedConversation,
					conversationKey: 'vk-dialog-test-user',
				})),
				patchMethod(prisma.aiConversation, 'update', async ({ data }) => ({
					...storedConversation,
					conversationKey: 'vk-dialog-test-user',
					...data,
				})),
				patchMethod(prisma.aiMessage, 'create', async data => ({ id: 'ai_msg_voice_1', ...data })),
				patchMethod(aiClient, 'voice', async payload => {
					capturedVoiceRequest = payload
					return {
						transcript: 'voice text',
						reply: 'voice reply',
						user_id: payload.userId,
						conversation_id: payload.conversationId,
					}
				}),
			]

			try {
				const response = await aiService.sendVoice({
					userId: 'test-user',
					conversationId: 'vk-dialog-test-user',
					file: { name: 'voice.webm', size: 12, type: 'audio/webm' },
				})

				assert.equal(capturedVoiceRequest.userId, 'vk-voice-user')
				assert.equal(capturedVoiceRequest.conversationId, 'vk_vk-voice-user_default')
				assert.equal(response.user_id, 'vk-voice-user')
				assert.equal(response.conversation_id, 'vk_vk-voice-user_default')
				assert.equal(response.local_conversation_id, 'vk-dialog-test-user')
			} finally {
				restoreAll(restores)
			}
		},
	},
]
