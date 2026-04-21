import assert from 'node:assert/strict'
import crypto from 'node:crypto'

import prisma from '../src/db/prisma.js'
import { createAccessToken, startTestServer, stopTestServer } from './helpers/http.js'
import { patchMethod, restoreAll } from './helpers/patch.js'

const createDevPhoneUserId = phoneE164 =>
	`dev-phone-${crypto.createHash('sha1').update(phoneE164).digest('hex').slice(0, 12)}`

export const cases = [
	{
		name: '/api/users/me uses backend admin=false instead of JWT isAdmin=true',
		run: async () => {
			const userId = 'user-non-admin'
			const phoneE164 = '+79990000000'
			const restores = [
				patchMethod(prisma.user, 'findUnique', async args => {
					if (args?.where?.id !== userId) return null
					if (args?.select) {
						return { email: 'user@example.com', phoneE164 }
					}
					return {
						id: userId,
						email: 'user@example.com',
						phoneE164,
						firstName: 'Regular',
						lastName: 'User',
						avatarUrl: null,
						status: 'active',
						wallet: null,
						subscriptions: [],
					}
				}),
				patchMethod(prisma.authIdentity, 'findFirst', async () => null),
			]

			const token = createAccessToken({ sub: userId, isAdmin: true, phoneE164 })
			const { server, baseUrl } = await startTestServer()

			try {
				const response = await fetch(`${baseUrl}/api/users/me`, {
					headers: { Authorization: `Bearer ${token}` },
				})
				const payload = await response.json()

				assert.equal(response.status, 200)
				assert.equal(payload.isAdmin, false)
			} finally {
				restoreAll(restores)
				await stopTestServer(server)
			}
		},
	},
	{
		name: '/api/users/me uses backend admin=true instead of JWT isAdmin=false',
		run: async () => {
			const userId = 'user-admin-backend'
			const phoneE164 = '+79057353580'
			const restores = [
				patchMethod(prisma.user, 'findUnique', async args => {
					if (args?.where?.id !== userId) return null
					if (args?.select) {
						return { email: 'admin@example.com', phoneE164 }
					}
					return {
						id: userId,
						email: 'admin@example.com',
						phoneE164,
						firstName: 'Backend',
						lastName: 'Admin',
						avatarUrl: null,
						status: 'active',
						wallet: null,
						subscriptions: [],
					}
				}),
				patchMethod(prisma.authIdentity, 'findFirst', async () => null),
			]

			const token = createAccessToken({ sub: userId, isAdmin: false, phoneE164 })
			const { server, baseUrl } = await startTestServer()

			try {
				const response = await fetch(`${baseUrl}/api/users/me`, {
					headers: { Authorization: `Bearer ${token}` },
				})
				const payload = await response.json()

				assert.equal(response.status, 200)
				assert.equal(payload.isAdmin, true)
			} finally {
				restoreAll(restores)
				await stopTestServer(server)
			}
		},
	},
	{
		name: 'dev profile fallback returns backend-derived isAdmin',
		run: async () => {
			const adminPhone = '+79057353580'
			const userId = createDevPhoneUserId(adminPhone)
			const restores = [
				patchMethod(prisma.user, 'findUnique', async () => {
					throw Object.assign(new Error("Can't reach database server"), { code: 'P1001' })
				}),
			]

			const token = createAccessToken({ sub: userId, isAdmin: false, phoneE164: adminPhone })
			const { server, baseUrl } = await startTestServer()

			try {
				const response = await fetch(`${baseUrl}/api/users/me`, {
					headers: { Authorization: `Bearer ${token}` },
				})
				const payload = await response.json()

				assert.equal(response.status, 200)
				assert.equal(payload.id, userId)
				assert.equal(payload.isAdmin, true)
			} finally {
				restoreAll(restores)
				await stopTestServer(server)
			}
		},
	},
]
