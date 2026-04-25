import assert from 'node:assert/strict'

import prisma from '../src/db/prisma.js'
import { aiClient } from '../src/modules/ai/ai.client.js'
import { workspaceService } from '../src/modules/workspace/workspace.service.js'
import { startTestServer, stopTestServer, createAccessToken } from './helpers/http.js'
import { patchMethod, restoreAll } from './helpers/patch.js'

const activeAiSubscription = {
	id: 'sub_ai_1',
	userId: 'test-user',
	status: 'active',
	periodStart: new Date('2026-04-01T00:00:00.000Z'),
	periodEnd: new Date('2026-05-01T00:00:00.000Z'),
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
		name: 'POST /api/ai/chat passes session context through route to AI service',
		run: async () => {
			const restores = [
				patchMethod(prisma.subscription, 'updateMany', async () => ({ count: 0 })),
				patchMethod(prisma.subscription, 'findFirst', async () => activeAiSubscription),
				patchMethod(prisma.usageEvent, 'groupBy', async () => []),
				patchMethod(prisma.usageEvent, 'create', async data => ({ id: 'usage_1', ...data })),
				patchMethod(prisma.aiConversation, 'findUnique', async () => null),
				patchMethod(prisma.aiConversation, 'create', async () => storedConversation),
				patchMethod(prisma.aiConversation, 'update', async ({ data }) => ({ ...storedConversation, ...data })),
				patchMethod(prisma.aiMessage, 'create', async data => ({ id: 'ai_msg_1', ...data })),
				patchMethod(workspaceService, 'getAiMemory', async () => ({ aiMemory: 'persistent memory' })),
				patchMethod(aiClient, 'chat', async ({ userId, conversationId, message, userMemory, sessionContext }) => ({
					reply: 'AI reply',
					user_id: userId,
					conversation_id: conversationId,
					upstream_message: message,
					upstream_user_memory: userMemory,
					upstream_session_context: sessionContext,
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
						conversationId: 'conv-with-access',
						message: 'hello',
						sessionContext: 'current task',
					}),
				})
				const payload = await response.json()

				assert.equal(response.status, 200)
				assert.equal(payload.reply, 'AI reply')
				assert.equal(payload.conversation_id, 'conv-with-access')
				assert.equal(payload.upstream_message, 'hello')
				assert.equal(payload.upstream_user_memory, 'persistent memory')
				assert.equal(payload.upstream_session_context, 'current task')
				assert.equal(payload.upstream_message.includes('[TEMPORARY SESSION RULES - HIGH PRIORITY]'), false)
			} finally {
				restoreAll(restores)
				await stopTestServer(server)
			}
		},
	},
	{
		name: 'POST /api/ai/chat supports simple mode via upstream simple endpoint',
		run: async () => {
			const restores = [
				patchMethod(prisma.subscription, 'updateMany', async () => ({ count: 0 })),
				patchMethod(prisma.subscription, 'findFirst', async () => activeAiSubscription),
				patchMethod(prisma.usageEvent, 'groupBy', async () => []),
				patchMethod(prisma.usageEvent, 'create', async data => ({ id: 'usage_simple_1', ...data })),
				patchMethod(prisma.aiConversation, 'findUnique', async () => null),
				patchMethod(prisma.aiConversation, 'create', async () => ({
					...storedConversation,
					conversationKey: 'aivk-simple-test-user',
					mode: 'simple',
				})),
				patchMethod(prisma.aiConversation, 'update', async ({ data }) => ({ ...storedConversation, ...data })),
				patchMethod(prisma.aiMessage, 'create', async data => ({ id: 'ai_msg_simple_1', ...data })),
				patchMethod(workspaceService, 'getAiMemory', async () => ({ aiMemory: 'persistent memory' })),
				patchMethod(aiClient, 'simpleChat', async ({ message }) => ({
					reply: `simple:${message}`,
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
						message: 'hello-simple',
					}),
				})
				const payload = await response.json()

				assert.equal(response.status, 200)
				assert.equal(payload.reply, 'simple:ИНСТРУКЦИЯ:\npersistent memory\n\nВОПРОС:\nhello-simple')
			} finally {
				restoreAll(restores)
				await stopTestServer(server)
			}
		},
	},
	{
		name: 'GET /api/ai/history/:conversationId returns DB-backed AI history',
		run: async () => {
			const restores = [
				patchMethod(prisma.subscription, 'updateMany', async () => ({ count: 0 })),
				patchMethod(prisma.subscription, 'findFirst', async () => activeAiSubscription),
				patchMethod(prisma.usageEvent, 'groupBy', async () => []),
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
				assert.equal(payload.conversation_id, 'conv-db')
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
		name: 'GET /api/ai/conversations returns DB-backed conversation list',
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

				assert.equal(response.status, 200)
				assert.equal(Array.isArray(payload), true)
				assert.equal(payload[0].conversation_key, 'conv-db')
				assert.equal(payload[0].message_count, 2)
			} finally {
				restoreAll(restores)
				await stopTestServer(server)
			}
		},
	},
	{
		name: 'POST /api/ai/history/:conversationId/reset clears DB-backed AI history',
		run: async () => {
			const restores = [
				patchMethod(prisma.subscription, 'updateMany', async () => ({ count: 0 })),
				patchMethod(prisma.subscription, 'findFirst', async () => activeAiSubscription),
				patchMethod(prisma.usageEvent, 'groupBy', async () => []),
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
				patchMethod(aiClient, 'resetConversation', async ({ userId, conversationId }) => ({
					status: 'ok',
					user_id: userId,
					conversation_id: conversationId,
				})),
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
				assert.equal(payload.conversation_id, 'conv-db')
			} finally {
				restoreAll(restores)
				await stopTestServer(server)
			}
		},
	},
]
