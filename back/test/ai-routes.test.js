import assert from 'node:assert/strict'

import { startTestServer, stopTestServer } from './helpers/http.js'

export const cases = [
	{
		name: 'GET /api/ai/plans returns 401 without auth, not 404',
		run: async () => {
			const { server, baseUrl } = await startTestServer()

			try {
				const response = await fetch(`${baseUrl}/api/ai/plans`)
				const payload = await response.json()

				assert.equal(response.status, 401)
				assert.notEqual(response.status, 404)
				assert.equal(payload.message, 'Unauthorized')
			} finally {
				await stopTestServer(server)
			}
		},
	},
	{
		name: 'GET /api/ai/access returns 401 without auth, not 404',
		run: async () => {
			const { server, baseUrl } = await startTestServer()

			try {
				const response = await fetch(`${baseUrl}/api/ai/access`)
				const payload = await response.json()

				assert.equal(response.status, 401)
				assert.notEqual(response.status, 404)
				assert.equal(payload.message, 'Unauthorized')
			} finally {
				await stopTestServer(server)
			}
		},
	},
	{
		name: 'GET /api/ai/health returns 401 without auth, not 404',
		run: async () => {
			const { server, baseUrl } = await startTestServer()

			try {
				const response = await fetch(`${baseUrl}/api/ai/health`)
				const payload = await response.json()

				assert.equal(response.status, 401)
				assert.notEqual(response.status, 404)
				assert.equal(payload.message, 'Unauthorized')
			} finally {
				await stopTestServer(server)
			}
		},
	},
	{
		name: 'GET /api/ai/history/:conversationId returns 401 without auth, not 404',
		run: async () => {
			const { server, baseUrl } = await startTestServer()

			try {
				const response = await fetch(`${baseUrl}/api/ai/history/test-conv`)
				const payload = await response.json()

				assert.equal(response.status, 401)
				assert.notEqual(response.status, 404)
				assert.equal(payload.message, 'Unauthorized')
			} finally {
				await stopTestServer(server)
			}
		},
	},
	{
		name: 'GET /api/ai/conversations returns 401 without auth, not 404',
		run: async () => {
			const { server, baseUrl } = await startTestServer()

			try {
				const response = await fetch(`${baseUrl}/api/ai/conversations`)
				const payload = await response.json()

				assert.equal(response.status, 401)
				assert.notEqual(response.status, 404)
				assert.equal(payload.message, 'Unauthorized')
			} finally {
				await stopTestServer(server)
			}
		},
	},
]
