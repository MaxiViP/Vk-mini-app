import assert from 'node:assert/strict'

import prisma from '../src/db/prisma.js'
import { adminService } from '../src/modules/admin/admin.service.js'
import { billingService } from '../src/modules/billing/billing.service.js'
import { userService } from '../src/modules/users/user.service.js'
import { createAccessToken, startTestServer, stopTestServer } from './helpers/http.js'
import { patchMethod, restoreAll } from './helpers/patch.js'

const createAdminIdentityMocks = phoneE164 => [
	patchMethod(prisma.user, 'findUnique', async ({ where, select }) => {
		if (!where?.id) return null
		if (select && Object.prototype.hasOwnProperty.call(select, 'id')) {
			return { id: String(where.id) }
		}
		return {
			email: null,
			phoneE164,
		}
	}),
	patchMethod(prisma.authIdentity, 'findFirst', async () => null),
]

export const cases = [
	{
		name: 'POST /api/users/me/activity requires auth',
		run: async () => {
			const { server, baseUrl } = await startTestServer()

			try {
				const response = await fetch(`${baseUrl}/api/users/me/activity`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ activeSeconds: 15 }),
				})
				const payload = await response.json()

				assert.equal(response.status, 401)
				assert.equal(payload.message, 'Unauthorized')
			} finally {
				await stopTestServer(server)
			}
		},
	},
	{
		name: 'POST /api/users/me/activity returns ok for authenticated user',
		run: async () => {
			const restores = [
				patchMethod(userService, 'trackActivity', async (userId, payload) => ({
					ok: true,
					userId,
					activeSeconds: Number(payload.activeSeconds || 0),
				})),
			]
			const token = createAccessToken({ sub: 'activity-user', phoneE164: '+79990000001' })
			const { server, baseUrl } = await startTestServer()

			try {
				const response = await fetch(`${baseUrl}/api/users/me/activity`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${token}`,
					},
					body: JSON.stringify({ activeSeconds: 15, page: '/chat' }),
				})
				const payload = await response.json()

				assert.equal(response.status, 200)
				assert.equal(payload.ok, true)
				assert.equal(payload.userId, 'activity-user')
				assert.equal(payload.activeSeconds, 15)
			} finally {
				restoreAll(restores)
				await stopTestServer(server)
			}
		},
	},
	{
		name: 'GET /api/admin/users enforces admin access and returns users overview for admin',
		run: async () => {
			const adminRestores = [
				...createAdminIdentityMocks('+79057353580'),
				patchMethod(adminService, 'listUsersOverview', async () => [
					{
						id: 'user-1',
						email: 'user@example.com',
						phoneE164: '+79990000002',
						firstName: 'Test',
						lastName: 'User',
						status: 'active',
						createdAt: '2026-04-21T00:00:00.000Z',
						wallet: { balanceMinor: 0, currency: 'RUB' },
					},
				]),
			]
			const nonAdminRestores = createAdminIdentityMocks('+79990000003')
			const adminToken = createAccessToken({ sub: 'admin-user' })
			const nonAdminToken = createAccessToken({ sub: 'regular-user' })
			const { server, baseUrl } = await startTestServer()

			try {
				const unauthorized = await fetch(`${baseUrl}/api/admin/users`)
				const unauthorizedPayload = await unauthorized.json()
				assert.equal(unauthorized.status, 401)
				assert.equal(unauthorizedPayload.message, 'Unauthorized')

				const forbidden = await fetch(`${baseUrl}/api/admin/users`, {
					headers: { Authorization: `Bearer ${nonAdminToken}` },
				})
				const forbiddenPayload = await forbidden.json()
				assert.equal(forbidden.status, 403)
				assert.equal(forbiddenPayload.message, 'Admin access required')

				restoreAll(nonAdminRestores)

				const response = await fetch(`${baseUrl}/api/admin/users`, {
					headers: { Authorization: `Bearer ${adminToken}` },
				})
				const payload = await response.json()

				assert.equal(response.status, 200)
				assert.ok(Array.isArray(payload))
				assert.equal(payload[0].id, 'user-1')
				assert.equal(payload[0].wallet.currency, 'RUB')
			} finally {
				restoreAll(adminRestores)
				if (nonAdminRestores.length) restoreAll(nonAdminRestores)
				await stopTestServer(server)
			}
		},
	},
	{
		name: 'POST /api/billing/yookassa/preview requires auth and returns preview contract',
		run: async () => {
			const restores = [
				patchMethod(billingService, 'previewYooKassaPayment', async ({ amount }) => ({
					baseAmountMinor: Number(amount) * 100,
					bonusMinor: 500,
					creditedAmountMinor: Number(amount) * 100 + 500,
					appliedDiscount: {
						code: 'TESTBONUS',
						name: 'Test bonus',
						type: 'bonus',
						value: 500,
					},
					message: null,
				})),
			]
			const token = createAccessToken({ sub: 'billing-user' })
			const { server, baseUrl } = await startTestServer()

			try {
				const unauthorized = await fetch(`${baseUrl}/api/billing/yookassa/preview`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ amount: 100 }),
				})
				const unauthorizedPayload = await unauthorized.json()
				assert.equal(unauthorized.status, 401)
				assert.equal(unauthorizedPayload.message, 'Unauthorized')

				const response = await fetch(`${baseUrl}/api/billing/yookassa/preview`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${token}`,
					},
					body: JSON.stringify({ amount: 100 }),
				})
				const payload = await response.json()

				assert.equal(response.status, 200)
				assert.equal(payload.baseAmountMinor, 10000)
				assert.equal(payload.bonusMinor, 500)
				assert.equal(payload.creditedAmountMinor, 10500)
				assert.equal(payload.appliedDiscount.code, 'TESTBONUS')
			} finally {
				restoreAll(restores)
				await stopTestServer(server)
			}
		},
	},
]
