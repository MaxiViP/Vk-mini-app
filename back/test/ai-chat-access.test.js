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
		name: 'POST /api/ai/chat passes with access and returns AI reply',
		run: async () => {
			const restores = [
				patchMethod(prisma.subscription, 'updateMany', async () => ({ count: 0 })),
				patchMethod(prisma.subscription, 'findFirst', async () => activeAiSubscription),
				patchMethod(prisma.usageEvent, 'groupBy', async () => []),
				patchMethod(prisma.usageEvent, 'create', async data => ({ id: 'usage_1', ...data })),
				patchMethod(workspaceService, 'getAiMemory', async () => ({ aiMemory: 'persistent memory' })),
				patchMethod(aiClient, 'chat', async ({ userId, conversationId, message }) => ({
					reply: 'AI reply',
					user_id: userId,
					conversation_id: conversationId,
					upstream_message: message,
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
			} finally {
				restoreAll(restores)
				await stopTestServer(server)
			}
		},
	},
]
