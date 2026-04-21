import assert from 'node:assert/strict'
import crypto from 'node:crypto'

import prisma from '../src/db/prisma.js'
import { issueDevAuthResult } from '../src/modules/auth/dev-session.store.js'
import { authService } from '../src/modules/auth/auth.service.js'
import { startTestServer, stopTestServer } from './helpers/http.js'
import { patchMethod, restoreAll } from './helpers/patch.js'

const createStorageUnavailableError = () =>
	Object.assign(new Error("Can't reach database server"), {
		code: 'P1001',
	})

const withMockedDate = async (nowMs, fn) => {
	const RealDate = Date

	class MockDate extends RealDate {
		constructor(...args) {
			super(args.length === 0 ? nowMs : args[0], ...args.slice(1))
		}

		static now() {
			return nowMs
		}

		static parse = RealDate.parse
		static UTC = RealDate.UTC
	}

	globalThis.Date = MockDate
	try {
		return await fn()
	} finally {
		globalThis.Date = RealDate
	}
}

const createDevPhoneUserId = phoneE164 =>
	`dev-phone-${crypto.createHash('sha1').update(phoneE164).digest('hex').slice(0, 12)}`

let devPhoneSequence = 1

const createDevFallbackSession = async baseUrl => {
	const phone = `+7905000${String(devPhoneSequence).padStart(4, '0')}`
	devPhoneSequence += 1

	const requestResponse = await fetch(`${baseUrl}/api/auth/phone/request`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ phone }),
	})
	const requestPayload = await requestResponse.json()

	assert.equal(requestResponse.status, 202)
	assert.equal(typeof requestPayload.challengeId, 'string')
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
	assert.equal(verifyPayload.user.id, createDevPhoneUserId(phone))

	return verifyPayload
}

export const cases = [
	{
		name: 'dev phone auth fallback issues dev-refresh token',
		run: async () => {
			const restores = [
				patchMethod(prisma.otpCode, 'create', async () => {
					throw createStorageUnavailableError()
				}),
				patchMethod(authService, 'upsertPhoneUser', async () => {
					throw createStorageUnavailableError()
				}),
			]

			const { server, baseUrl } = await startTestServer()

			try {
				const payload = await createDevFallbackSession(baseUrl)
				assert.match(payload.refreshToken, /^dev-refresh-/)
				assert.equal(payload.user.status, 'active')
			} finally {
				restoreAll(restores)
				await stopTestServer(server)
			}
		},
	},
	{
		name: 'dev refresh session is renewed through backend refresh route',
		run: async () => {
			const restores = [
				patchMethod(prisma.otpCode, 'create', async () => {
					throw createStorageUnavailableError()
				}),
				patchMethod(authService, 'upsertPhoneUser', async () => {
					throw createStorageUnavailableError()
				}),
			]

			const { server, baseUrl } = await startTestServer()

			try {
				const session = await createDevFallbackSession(baseUrl)
				const response = await fetch(`${baseUrl}/api/auth/refresh`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ refreshToken: session.refreshToken }),
				})
				const payload = await response.json()

				assert.equal(response.status, 200)
				assert.match(payload.refreshToken, /^dev-refresh-/)
				assert.notEqual(payload.refreshToken, session.refreshToken)
				assert.equal(payload.user.id, session.user.id)
				assert.equal(typeof payload.accessToken, 'string')
			} finally {
				restoreAll(restores)
				await stopTestServer(server)
			}
		},
	},
	{
		name: 'logout removes dev refresh session',
		run: async () => {
			const restores = [
				patchMethod(prisma.otpCode, 'create', async () => {
					throw createStorageUnavailableError()
				}),
				patchMethod(authService, 'upsertPhoneUser', async () => {
					throw createStorageUnavailableError()
				}),
			]

			const { server, baseUrl } = await startTestServer()

			try {
				const session = await createDevFallbackSession(baseUrl)

				const logoutResponse = await fetch(`${baseUrl}/api/auth/logout`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ refreshToken: session.refreshToken }),
				})
				const logoutPayload = await logoutResponse.json()

				assert.equal(logoutResponse.status, 200)
				assert.equal(logoutPayload.success, true)

				const refreshResponse = await fetch(`${baseUrl}/api/auth/refresh`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ refreshToken: session.refreshToken }),
				})
				const refreshPayload = await refreshResponse.json()

				assert.equal(refreshResponse.status, 401)
				assert.equal(refreshPayload.message, 'Invalid refresh token')
			} finally {
				restoreAll(restores)
				await stopTestServer(server)
			}
		},
	},
	{
		name: 'invalid dev refresh token returns 401',
		run: async () => {
			const { server, baseUrl } = await startTestServer()

			try {
				const response = await fetch(`${baseUrl}/api/auth/refresh`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ refreshToken: 'dev-refresh-invalid-token' }),
				})
				const payload = await response.json()

				assert.equal(response.status, 401)
				assert.equal(payload.message, 'Invalid refresh token')
			} finally {
				await stopTestServer(server)
			}
		},
	},
	{
		name: 'expired dev refresh token returns 401',
		run: async () => {
			const phoneUser = {
				id: createDevPhoneUserId('+79050000002'),
				email: null,
				phoneE164: '+79050000002',
				firstName: 'User',
				lastName: 'Phone',
				avatarUrl: null,
				status: 'active',
				isAdmin: false,
			}

			const { server, baseUrl } = await startTestServer()

			try {
				const session = await withMockedDate(0, async () => issueDevAuthResult(phoneUser))

				const response = await withMockedDate(40 * 24 * 60 * 60 * 1000, async () =>
					fetch(`${baseUrl}/api/auth/refresh`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ refreshToken: session.refreshToken }),
					}),
				)
				const payload = await response.json()

				assert.equal(response.status, 401)
				assert.equal(payload.message, 'Invalid refresh token')
			} finally {
				await stopTestServer(server)
			}
		},
	},
]
