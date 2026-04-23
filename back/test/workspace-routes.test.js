import assert from 'node:assert/strict'

import prisma from '../src/db/prisma.js'
import { createAccessToken, startTestServer, stopTestServer } from './helpers/http.js'
import { patchMethod, patchValue, restoreAll } from './helpers/patch.js'

export const cases = [
	{
		name: 'GET /api/workspace/me returns 401 without auth',
		run: async () => {
			const { server, baseUrl } = await startTestServer()

			try {
				const response = await fetch(`${baseUrl}/api/workspace/me`)
				const payload = await response.json()

				assert.equal(response.status, 401)
				assert.equal(payload.message, 'Unauthorized')
			} finally {
				await stopTestServer(server)
			}
		},
	},
	{
		name: 'PUT /api/workspace/me/chat-history returns 401 without auth',
		run: async () => {
			const { server, baseUrl } = await startTestServer()

			try {
				const response = await fetch(`${baseUrl}/api/workspace/me/chat-history`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						chatHistory: [{ role: 'user', content: 'hello', timestamp: 1 }],
					}),
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
		name: 'PUT /api/workspace/me/notes returns 401 without auth',
		run: async () => {
			const { server, baseUrl } = await startTestServer()

			try {
				const response = await fetch(`${baseUrl}/api/workspace/me/notes`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						notesPayload: { notes: [], folders: [] },
					}),
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
		name: 'GET /api/workspace/me/ai-memory reads aiMemory from users table',
		run: async () => {
			const restores = [
				patchMethod(prisma.user, 'findUnique', async () => ({
					aiMemory: 'remember from user row',
					updatedAt: new Date('2026-04-23T10:00:00.000Z'),
				})),
			]
			const token = createAccessToken({ sub: 'workspace-memory-user' })
			const { server, baseUrl } = await startTestServer()

			try {
				const response = await fetch(`${baseUrl}/api/workspace/me/ai-memory`, {
					headers: { Authorization: `Bearer ${token}` },
				})
				const payload = await response.json()

				assert.equal(response.status, 200)
				assert.equal(payload.aiMemory, 'remember from user row')
				assert.equal(typeof payload.updatedAt, 'string')
			} finally {
				restoreAll(restores)
				await stopTestServer(server)
			}
		},
	},
	{
		name: 'PUT /api/workspace/me/ai-memory stores aiMemory in users table',
		run: async () => {
			let capturedUpdate = null
			const restores = [
				patchMethod(prisma.user, 'upsert', async payload => {
					capturedUpdate = payload
					return {
						aiMemory: payload.update.aiMemory,
						updatedAt: new Date('2026-04-23T10:05:00.000Z'),
					}
				}),
			]
			const token = createAccessToken({ sub: 'workspace-memory-save-user' })
			const { server, baseUrl } = await startTestServer()

			try {
				const response = await fetch(`${baseUrl}/api/workspace/me/ai-memory`, {
					method: 'PUT',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${token}`,
					},
					body: JSON.stringify({
						aiMemory: 'store this in users.aiMemory',
					}),
				})
				const payload = await response.json()

				assert.equal(response.status, 200)
				assert.equal(payload.aiMemory, 'store this in users.aiMemory')
				assert.equal(capturedUpdate.where.id, 'workspace-memory-save-user')
				assert.equal(capturedUpdate.update.aiMemory, 'store this in users.aiMemory')
				assert.equal(typeof payload.updatedAt, 'string')
			} finally {
				restoreAll(restores)
				await stopTestServer(server)
			}
		},
	},
	{
		name: 'GET /api/workspace/me returns fallback workspace for authenticated user',
		run: async () => {
			const restores = [patchValue(prisma, 'userWorkspace', undefined)]
			const token = createAccessToken({ sub: 'workspace-user' })
			const { server, baseUrl } = await startTestServer()

			try {
				const response = await fetch(`${baseUrl}/api/workspace/me`, {
					headers: { Authorization: `Bearer ${token}` },
				})
				const payload = await response.json()

				assert.equal(response.status, 200)
				assert.ok(Array.isArray(payload.chatHistory))
				assert.deepEqual(payload.chatHistory, [])
				assert.ok(payload.notesPayload)
				assert.ok(Array.isArray(payload.notesPayload.notes))
				assert.ok(Array.isArray(payload.notesPayload.folders))
				assert.equal(payload.notesPayload.folders[0]?.id, 'inbox')
				assert.equal(typeof payload.updatedAt, 'string')
			} finally {
				restoreAll(restores)
				await stopTestServer(server)
			}
		},
	},
	{
		name: 'PUT /api/workspace/me/chat-history preserves basic flow in fallback mode',
		run: async () => {
			const restores = [patchValue(prisma, 'userWorkspace', undefined)]
			const token = createAccessToken({ sub: 'workspace-chat-user' })
			const { server, baseUrl } = await startTestServer()

			try {
				const response = await fetch(`${baseUrl}/api/workspace/me/chat-history`, {
					method: 'PUT',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${token}`,
					},
					body: JSON.stringify({
						chatHistory: [
							{ role: 'user', content: 'hello', timestamp: 123 },
							{ role: 'assistant', content: 'world', timestamp: 456 },
							{ role: 'system', content: 'ignore-me', timestamp: 999 },
							{ role: 'user', content: 42, timestamp: 1000 },
						],
					}),
				})
				const payload = await response.json()

				assert.equal(response.status, 200)
				assert.ok(Array.isArray(payload.chatHistory))
				assert.deepEqual(payload.chatHistory, [
					{ role: 'user', content: 'hello', timestamp: 123 },
					{ role: 'assistant', content: 'world', timestamp: 456 },
				])
				assert.equal(typeof payload.updatedAt, 'string')
			} finally {
				restoreAll(restores)
				await stopTestServer(server)
			}
		},
	},
	{
		name: 'PUT /api/workspace/me/notes preserves basic flow in fallback mode',
		run: async () => {
			const restores = [patchValue(prisma, 'userWorkspace', undefined)]
			const token = createAccessToken({ sub: 'workspace-notes-user' })
			const { server, baseUrl } = await startTestServer()

			try {
				const response = await fetch(`${baseUrl}/api/workspace/me/notes`, {
					method: 'PUT',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${token}`,
					},
					body: JSON.stringify({
						notesPayload: {
							notes: [
								{ text: 'note-1', date: 111, folderId: 'custom-folder' },
								{ text: 123, date: 222, folderId: 'bad-folder' },
							],
							folders: [{ id: 'custom-folder', name: 'Custom' }],
							aiMemory: 'remember this context',
						},
					}),
				})
				const payload = await response.json()

				assert.equal(response.status, 200)
				assert.ok(payload.notesPayload)
				assert.deepEqual(payload.notesPayload.notes, [{ text: 'note-1', date: 111, folderId: 'custom-folder' }])
				assert.deepEqual(payload.notesPayload.folders, [
					{ id: 'inbox', name: 'Входящие' },
					{ id: 'custom-folder', name: 'Custom' },
				])
				assert.equal(payload.notesPayload.aiMemory, 'remember this context')
				assert.equal(typeof payload.updatedAt, 'string')
			} finally {
				restoreAll(restores)
				await stopTestServer(server)
			}
		},
	},
]
