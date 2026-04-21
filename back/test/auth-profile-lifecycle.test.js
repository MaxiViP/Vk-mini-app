import assert from 'node:assert/strict'
import crypto from 'node:crypto'

import prisma from '../src/db/prisma.js'
import { authService } from '../src/modules/auth/auth.service.js'
import { createAccessToken, startTestServer, stopTestServer } from './helpers/http.js'
import { patchMethod, restoreAll } from './helpers/patch.js'

const createStorageUnavailableError = () =>
	Object.assign(new Error("Can't reach database server"), {
		code: 'P1001',
	})

const createDevPhoneUserId = phoneE164 =>
	`dev-phone-${crypto.createHash('sha1').update(phoneE164).digest('hex').slice(0, 12)}`

let phoneSequence = 2000

const createPhoneSession = async (baseUrl, phone) => {
	const requestResponse = await fetch(`${baseUrl}/api/auth/phone/request`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ phone }),
	})
	const requestPayload = await requestResponse.json()

	assert.equal(requestResponse.status, 202)
	assert.equal(typeof requestPayload.debugCode, 'string')

	const verifyResponse = await fetch(`${baseUrl}/api/auth/phone/verify`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			challengeId: requestPayload.challengeId,
			code: requestPayload.debugCode,
		}),
	})
	const verifyPayload = await verifyResponse.json()

	assert.equal(verifyResponse.status, 200)
	return verifyPayload
}

const getProfile = async (baseUrl, accessToken) => {
	const response = await fetch(`${baseUrl}/api/users/me`, {
		headers: { Authorization: `Bearer ${accessToken}` },
	})
	const payload = await response.json()

	assert.equal(response.status, 200)
	return payload
}

const refreshSession = async (baseUrl, refreshToken) => {
	const response = await fetch(`${baseUrl}/api/auth/refresh`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ refreshToken }),
	})
	const payload = await response.json()

	assert.equal(response.status, 200)
	return payload
}

const createRegularPhoneFlowMocks = user => {
	const sessions = new Map()
	let sessionCounter = 0

	return [
		patchMethod(prisma.otpCode, 'create', async () => {
			throw createStorageUnavailableError()
		}),
		patchMethod(authService, 'upsertPhoneUser', async () => ({ ...user })),
		patchMethod(prisma.wallet, 'upsert', async () => ({
			userId: user.id,
			balanceMinor: 0,
			currency: 'RUB',
		})),
		patchMethod(prisma.session, 'create', async ({ data }) => {
			sessionCounter += 1
			const session = {
				id: `session_${sessionCounter}`,
				...data,
				user: { ...user },
				revokedAt: null,
			}
			sessions.set(session.id, session)
			return session
		}),
		patchMethod(prisma.session, 'findFirst', async ({ where, include }) => {
			const session =
				Array.from(sessions.values()).find(
					item =>
						item.refreshTokenHash === where.refreshTokenHash &&
						item.revokedAt === null &&
						item.expiresAt > new Date(),
				) || null
			if (!session) return null
			return include?.user ? { ...session, user: { ...user } } : { ...session }
		}),
		patchMethod(prisma.session, 'update', async ({ where, data }) => {
			const existing = sessions.get(where.id)
			if (!existing) return null
			const updated = { ...existing, ...data }
			sessions.set(where.id, updated)
			return updated
		}),
		patchMethod(prisma.user, 'findUnique', async args => {
			if (args?.where?.id !== user.id) return null
			if (args?.select) {
				return {
					email: user.email,
					phoneE164: user.phoneE164,
				}
			}
			return {
				...user,
				wallet: {
					balanceMinor: 0,
					currency: 'RUB',
				},
				subscriptions: [],
			}
		}),
		patchMethod(prisma.authIdentity, 'findFirst', async () => null),
	]
}

export const cases = [
	{
		name: 'dev auth/profile lifecycle stays consistent after refresh',
		run: async () => {
			const adminPhone = '+79057353580'
			const expectedUserId = createDevPhoneUserId(adminPhone)
			const restores = [
				patchMethod(prisma.otpCode, 'create', async () => {
					throw createStorageUnavailableError()
				}),
				patchMethod(authService, 'upsertPhoneUser', async () => {
					throw createStorageUnavailableError()
				}),
				patchMethod(prisma.user, 'findUnique', async () => {
					throw createStorageUnavailableError()
				}),
			]

			const { server, baseUrl } = await startTestServer()

			try {
				const loginResult = await createPhoneSession(baseUrl, adminPhone)
				const profileBeforeRefresh = await getProfile(baseUrl, loginResult.accessToken)
				const refreshResult = await refreshSession(baseUrl, loginResult.refreshToken)
				const profileAfterRefresh = await getProfile(baseUrl, refreshResult.accessToken)

				assert.match(loginResult.refreshToken, /^dev-refresh-/)
				assert.equal(profileBeforeRefresh.id, expectedUserId)
				assert.equal(profileAfterRefresh.id, expectedUserId)
				assert.equal(profileBeforeRefresh.phoneE164, adminPhone)
				assert.equal(profileAfterRefresh.phoneE164, adminPhone)
				assert.equal(profileBeforeRefresh.isAdmin, true)
				assert.equal(profileAfterRefresh.isAdmin, true)
				assert.equal(profileBeforeRefresh.status, 'active')
				assert.equal(profileAfterRefresh.status, 'active')
				assert.equal(profileBeforeRefresh.firstName, 'User')
				assert.equal(profileAfterRefresh.firstName, 'User')
				assert.equal(typeof profileBeforeRefresh.wallet?.balanceMinor, 'number')
				assert.equal(typeof profileAfterRefresh.wallet?.balanceMinor, 'number')
			} finally {
				restoreAll(restores)
				await stopTestServer(server)
			}
		},
	},
	{
		name: 'regular auth/profile lifecycle stays consistent after refresh',
		run: async () => {
			phoneSequence += 1
			const adminPhone = '+79057353580'
			const user = {
				id: `user_regular_${phoneSequence}`,
				email: 'admin@example.com',
				phoneE164: adminPhone,
				firstName: 'Backend',
				lastName: 'Admin',
				avatarUrl: null,
				status: 'active',
			}
			const restores = createRegularPhoneFlowMocks(user)
			const { server, baseUrl } = await startTestServer()

			try {
				const loginResult = await createPhoneSession(baseUrl, `+7905${String(phoneSequence).padStart(7, '0')}`)
				const profileBeforeRefresh = await getProfile(baseUrl, loginResult.accessToken)
				const refreshResult = await refreshSession(baseUrl, loginResult.refreshToken)
				const profileAfterRefresh = await getProfile(baseUrl, refreshResult.accessToken)

				assert.doesNotMatch(loginResult.refreshToken, /^dev-refresh-/)
				assert.equal(profileBeforeRefresh.id, user.id)
				assert.equal(profileAfterRefresh.id, user.id)
				assert.equal(profileBeforeRefresh.phoneE164, adminPhone)
				assert.equal(profileAfterRefresh.phoneE164, adminPhone)
				assert.equal(profileBeforeRefresh.isAdmin, true)
				assert.equal(profileAfterRefresh.isAdmin, true)
				assert.equal(profileBeforeRefresh.status, 'active')
				assert.equal(profileAfterRefresh.status, 'active')
				assert.equal(profileBeforeRefresh.firstName, 'Backend')
				assert.equal(profileAfterRefresh.firstName, 'Backend')
				assert.equal(profileBeforeRefresh.email, 'admin@example.com')
				assert.equal(profileAfterRefresh.email, 'admin@example.com')
				assert.equal(typeof refreshResult.accessToken, 'string')
				assert.equal(typeof refreshResult.refreshToken, 'string')
			} finally {
				restoreAll(restores)
				await stopTestServer(server)
			}
		},
	},
]
