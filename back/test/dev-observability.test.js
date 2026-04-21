import assert from 'node:assert/strict'

import prisma from '../src/db/prisma.js'
import { apiActivityMiddleware, shouldSkipActivityLog } from '../src/shared/activity.middleware.js'
import { apiRateLimitMax, isWebhookPath, shouldSkipRateLimit } from '../src/shared/rate-limit.js'
import { createAccessToken } from './helpers/http.js'
import { patchMethod, restoreAll } from './helpers/patch.js'

const createMockResponse = () => {
	const listeners = new Map()

	return {
		statusCode: 200,
		on(event, callback) {
			listeners.set(event, callback)
		},
		trigger(event) {
			const callback = listeners.get(event)
			if (callback) callback()
		},
	}
}

export const cases = [
	{
		name: 'dev rate-limit excludes activity, admin and webhook paths but not regular API paths',
		run: async () => {
			assert.equal(apiRateLimitMax, 300)
			assert.equal(shouldSkipRateLimit({ path: '/api/users/me/activity' }), true)
			assert.equal(shouldSkipRateLimit({ path: '/api/admin/users' }), true)
			assert.equal(shouldSkipRateLimit({ path: '/api/billing/yookassa/webhook' }), true)
			assert.equal(shouldSkipRateLimit({ path: '/api/payments/yookassa/webhook' }), true)
			assert.equal(isWebhookPath('/api/billing/yookassa/webhook'), true)
			assert.equal(isWebhookPath('/api/payments/yookassa/webhook'), true)
			assert.equal(shouldSkipRateLimit({ path: '/api/llm/models' }), false)
		},
	},
	{
		name: 'activity middleware skip rules exclude heartbeat and admin paths in dev',
		run: async () => {
			assert.equal(shouldSkipActivityLog('/api/users/me/activity'), true)
			assert.equal(shouldSkipActivityLog('/api/admin/users'), true)
			assert.equal(shouldSkipActivityLog('/api/billing/yookassa/webhook'), true)
			assert.equal(shouldSkipActivityLog('/api/llm/models'), false)
		},
	},
	{
		name: 'activity middleware logs ordinary API requests for authenticated users',
		run: async () => {
			const creates = []
			const restores = [
				patchMethod(prisma.auditLog, 'create', async payload => {
					creates.push(payload)
					return { id: 'audit_1', ...payload }
				}),
			]

			const req = {
				path: '/api/llm/models',
				originalUrl: '/api/llm/models',
				method: 'GET',
				ip: '127.0.0.1',
				headers: {
					authorization: `Bearer ${createAccessToken({ sub: 'observed-user' })}`,
					'user-agent': 'test-agent',
				},
				header(name) {
					return this.headers[name.toLowerCase()] || null
				},
			}
			const res = createMockResponse()
			let nextCalled = false

			try {
				apiActivityMiddleware(req, res, () => {
					nextCalled = true
				})
				assert.equal(nextCalled, true)

				res.trigger('finish')
				await new Promise(resolve => setTimeout(resolve, 0))

				assert.equal(creates.length, 1)
				assert.equal(creates[0].data.actorUserId, 'observed-user')
				assert.equal(creates[0].data.entityId, 'GET /api/llm/models')
				assert.equal(creates[0].data.action, 'api.request')
			} finally {
				restoreAll(restores)
			}
		},
	},
	{
		name: 'activity middleware does not log heartbeat path',
		run: async () => {
			const creates = []
			const restores = [
				patchMethod(prisma.auditLog, 'create', async payload => {
					creates.push(payload)
					return { id: 'audit_1', ...payload }
				}),
			]

			const req = {
				path: '/api/users/me/activity',
				originalUrl: '/api/users/me/activity',
				method: 'POST',
				ip: '127.0.0.1',
				headers: {
					authorization: `Bearer ${createAccessToken({ sub: 'heartbeat-user' })}`,
				},
				header(name) {
					return this.headers[name.toLowerCase()] || null
				},
			}
			const res = createMockResponse()
			let nextCalled = false

			try {
				apiActivityMiddleware(req, res, () => {
					nextCalled = true
				})
				assert.equal(nextCalled, true)

				res.trigger('finish')
				await new Promise(resolve => setTimeout(resolve, 0))

				assert.equal(creates.length, 0)
			} finally {
				restoreAll(restores)
			}
		},
	},
]
