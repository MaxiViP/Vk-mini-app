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
				patchValue(env, 'vkAiClientId', 'main-prod'),
				patchValue(env, 'vkAiProfileId', 'fast_chat'),
				patchValue(env, 'vkAiBillingMode', 'auto'),
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
		name: 'aiClient.chat uses /v1/chat/messages and sends the new chat contract',
		run: async () => {
			const fetchCalls = []
			const restores = [
				patchValue(env, 'vkAiBackendUrl', 'https://aivk.example'),
				patchValue(env, 'vkAiBackendApiKey', 'test-api-key'),
				patchValue(env, 'vkAiBackendTimeoutMs', 1000),
				patchValue(env, 'vkAiClientId', 'main-prod'),
				patchValue(env, 'vkAiProfileId', 'fast_chat'),
				patchValue(env, 'vkAiBillingMode', 'auto'),
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
				const payload = await aiClient.chat({
					externalUserId: 'vk-user-1',
					userId: 'vk-user-1',
					conversationId: 'vk_vk-user-1_default',
					message: 'Say hello',
					metadata: {
						local_user_id: 'local-1',
						local_conversation_id: 'vk-dialog-local-1',
						mode: 'context',
						empty_note: '',
					},
					idempotencyKey: 'req-1',
				})

				assert.equal(payload.reply, 'ok')
				assert.equal(fetchCalls.length, 1)
				assert.equal(fetchCalls[0].url, 'https://aivk.example/v1/chat/messages')
				assert.equal(fetchCalls[0].options.method, 'POST')
				assert.equal(fetchCalls[0].options.headers['X-API-Key'], 'test-api-key')
				assert.equal(fetchCalls[0].options.headers['Content-Type'], 'application/json')
				assert.equal(fetchCalls[0].body.message, 'Say hello')
				assert.deepEqual(fetchCalls[0].body, {
					client_id: 'main-prod',
					platform: 'vk',
					external_user_id: 'vk-user-1',
					user_id: 'vk-user-1',
					conversation_id: 'vk_vk-user-1_default',
					message: 'Say hello',
					ai_profile_id: 'fast_chat',
					billing_mode: 'auto',
					metadata: {
						local_user_id: 'local-1',
						local_conversation_id: 'vk-dialog-local-1',
						mode: 'context',
					},
					idempotency_key: 'req-1',
				})
				assert.equal(Object.hasOwn(fetchCalls[0].body, 'user_memory'), false)
				assert.equal(Object.hasOwn(fetchCalls[0].body, 'session_context'), false)
				assert.equal(Object.hasOwn(fetchCalls[0].body, 'sessionContext'), false)
				assert.equal(Object.hasOwn(fetchCalls[0].body.metadata, 'empty_note'), false)
			} finally {
				restoreAll(restores)
			}
		},
	},
]
