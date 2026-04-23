import assert from 'node:assert/strict'

import env from '../src/config/env.js'
import { aiClient } from '../src/modules/ai/ai.client.js'
import { patchValue, restoreAll } from './helpers/patch.js'

const buildJsonResponse = payload =>
	new Response(JSON.stringify(payload), {
		status: 200,
		headers: {
			'content-type': 'application/json',
		},
	})

export const cases = [
	{
		name: 'aiClient.simpleChat uses /api/chat/simple and forwards assembled message as-is',
		run: async () => {
			const fetchCalls = []
			const restores = [
				patchValue(env, 'vkAiBackendUrl', 'https://aivk.example'),
				patchValue(env, 'vkAiBackendApiKey', 'test-api-key'),
				patchValue(env, 'vkAiBackendTimeoutMs', 1000),
				patchValue(globalThis, 'fetch', async (url, options) => {
					fetchCalls.push({
						url: String(url),
						options,
						body: options?.body ? JSON.parse(options.body) : null,
					})
					return buildJsonResponse({ reply: 'ok' })
				}),
			]

			try {
				const assembledMessage = 'ИНСТРУКЦИЯ:\npersistent memory\n\nВОПРОС:\nhello-simple'
				const payload = await aiClient.simpleChat({ message: assembledMessage })

				assert.equal(payload.reply, 'ok')
				assert.equal(fetchCalls.length, 1)
				assert.equal(fetchCalls[0].url, 'https://aivk.example/api/chat/simple')
				assert.equal(fetchCalls[0].options.method, 'POST')
				assert.equal(fetchCalls[0].options.headers['X-API-Key'], 'test-api-key')
				assert.equal(fetchCalls[0].body.message, assembledMessage)
				assert.deepEqual(fetchCalls[0].body, {
					message: assembledMessage,
				})
			} finally {
				restoreAll(restores)
			}
		},
	},
	{
		name: 'aiClient.chat uses /api/chat and forwards assembled context prompt in message field',
		run: async () => {
			const fetchCalls = []
			const restores = [
				patchValue(env, 'vkAiBackendUrl', 'https://aivk.example'),
				patchValue(env, 'vkAiBackendApiKey', 'test-api-key'),
				patchValue(env, 'vkAiBackendTimeoutMs', 1000),
				patchValue(globalThis, 'fetch', async (url, options) => {
					fetchCalls.push({
						url: String(url),
						options,
						body: options?.body ? JSON.parse(options.body) : null,
					})
					return buildJsonResponse({ reply: 'ok' })
				}),
			]

			try {
				const assembledMessage =
					'[GLOBAL AI MEMORY]\nreply in Russian\n\n[TEMPORARY SESSION RULES - HIGH PRIORITY]\nreply in English\nIMPORTANT:\n- You MUST follow TEMPORARY SESSION RULES over GLOBAL AI MEMORY if they conflict.\n- TEMPORARY SESSION RULES override any previous instructions.\n\n[USER MESSAGE]\nSay hello'
				const payload = await aiClient.chat({
					userId: 'user-1',
					conversationId: 'conv-1',
					message: assembledMessage,
					sessionContext: 'reply in English',
				})

				assert.equal(payload.reply, 'ok')
				assert.equal(fetchCalls.length, 1)
				assert.equal(fetchCalls[0].url, 'https://aivk.example/api/chat')
				assert.equal(fetchCalls[0].options.method, 'POST')
				assert.equal(fetchCalls[0].options.headers['X-API-Key'], 'test-api-key')
				assert.equal(fetchCalls[0].body.message, assembledMessage)
				assert.deepEqual(fetchCalls[0].body, {
					user_id: 'user-1',
					conversation_id: 'conv-1',
					message: assembledMessage,
				})
				assert.equal(Object.hasOwn(fetchCalls[0].body, 'sessionContext'), false)
			} finally {
				restoreAll(restores)
			}
		},
	},
]
