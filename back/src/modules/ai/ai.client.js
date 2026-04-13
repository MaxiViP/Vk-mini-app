import crypto from 'node:crypto'

import env from '../../config/env.js'
import logger from '../../config/logger.js'
import { AppError } from '../../shared/errors.js'

const clientLogger = logger.createChild({ module: 'ai-client' })

const sanitizeUrl = value => String(value || '').trim().replace(/\/+$/, '')
const getBaseUrl = () => sanitizeUrl(env.vkAiBackendUrl)
const getApiKey = () => String(env.vkAiBackendApiKey || '').trim()

const ensureConfigured = () => {
	if (!getBaseUrl()) {
		throw new AppError('VK_AI_BACKEND_URL is not configured', 503, {
			code: 'AI_BACKEND_UNAVAILABLE',
			reason: 'missing_backend_url',
		})
	}

	if (!getApiKey()) {
		throw new AppError('VK_AI_BACKEND_API_KEY is not configured', 503, {
			code: 'AI_BACKEND_UNAVAILABLE',
			reason: 'missing_backend_api_key',
		})
	}
}

const buildHeaders = (headers = {}) => ({
	'X-API-Key': getApiKey(),
	...headers,
})

const withTimeout = async fn => {
	const controller = new AbortController()
	const timeoutId = setTimeout(() => controller.abort(), Math.max(Number(env.vkAiBackendTimeoutMs) || 30000, 1000))

	try {
		return await fn(controller.signal)
	} catch (error) {
		if (error?.name === 'AbortError') {
			throw new AppError('AI backend is unavailable', 503, {
				code: 'AI_BACKEND_UNAVAILABLE',
				reason: 'timeout',
			})
		}

		if (error instanceof AppError) throw error

		clientLogger.error('AI backend request failed', {
			message: error?.message || 'Unknown error',
		})

		throw new AppError('AI backend is unavailable', 503, {
			code: 'AI_BACKEND_UNAVAILABLE',
			reason: 'network_error',
		})
	} finally {
		clearTimeout(timeoutId)
	}
}

const parseResponsePayload = async response => {
	const contentType = String(response.headers.get('content-type') || '').toLowerCase()

	if (contentType.includes('application/json')) {
		try {
			return await response.json()
		} catch {
			return null
		}
	}

	try {
		const text = await response.text()
		return text ? { message: text } : null
	} catch {
		return null
	}
}

const buildUpstreamError = async response => {
	const payload = await parseResponsePayload(response)
	const upstreamMessage =
		typeof payload?.message === 'string'
			? payload.message
			: typeof payload?.detail === 'string'
				? payload.detail
				: typeof payload?.error === 'string'
					? payload.error
					: `AI backend request failed with status ${response.status}`

	const upstreamCode =
		typeof payload?.error_code === 'string'
			? payload.error_code
			: typeof payload?.code === 'string'
				? payload.code
				: null

	clientLogger.warn('AI backend responded with error', {
		status: response.status,
		upstreamCode,
		upstreamMessage,
		requestId: payload?.request_id || crypto.randomUUID(),
	})

	if (response.status >= 500) {
		return new AppError('AI backend is unavailable', 503, {
			code: 'AI_BACKEND_UNAVAILABLE',
			upstreamStatus: response.status,
			upstreamMessage,
			upstreamCode,
		})
	}

	return new AppError(upstreamMessage, response.status, {
		code: upstreamCode || 'AI_BACKEND_ERROR',
		upstreamStatus: response.status,
		upstreamMessage,
		upstreamCode,
	})
}

const ensureOk = async response => {
	if (response.ok) return response
	throw await buildUpstreamError(response)
}

const parseJson = async response => {
	const safeResponse = await ensureOk(response)
	return safeResponse.json()
}

const requestJson = async (path, { method = 'GET', body = null, query = null } = {}) => {
	ensureConfigured()
	const url = new URL(`${getBaseUrl()}${path}`)

	if (query) {
		for (const [key, value] of Object.entries(query)) {
			if (value !== undefined && value !== null && value !== '') {
				url.searchParams.set(key, String(value))
			}
		}
	}

	return withTimeout(signal =>
		fetch(url, {
			method,
			headers: buildHeaders(body ? { 'Content-Type': 'application/json' } : undefined),
			body: body ? JSON.stringify(body) : undefined,
			signal,
		}).then(parseJson),
	)
}

const requestFormData = async (path, formData, { method = 'POST' } = {}) => {
	ensureConfigured()

	return withTimeout(signal =>
		fetch(`${getBaseUrl()}${path}`, {
			method,
			headers: buildHeaders(),
			body: formData,
			signal,
		}).then(parseJson),
	)
}

export const aiClient = {
	health() {
		return requestJson('/api/health')
	},

	chat({ userId, conversationId, message }) {
		return requestJson('/api/chat', {
			method: 'POST',
			body: {
				user_id: userId,
				conversation_id: conversationId,
				message,
			},
		})
	},

	uploadFile({ userId, conversationId, file }) {
		const formData = new FormData()
		formData.set('user_id', userId)
		formData.set('conversation_id', conversationId)
		formData.set('file', file, file.name || 'upload.bin')
		return requestFormData('/api/files/upload', formData)
	},

	voice({ userId, conversationId, file }) {
		const formData = new FormData()
		formData.set('user_id', userId)
		formData.set('conversation_id', conversationId)
		formData.set('audio', file, file.name || 'voice.webm')
		return requestFormData('/api/voice', formData)
	},

	getConversation({ userId, conversationId }) {
		return requestJson(`/api/conversations/${encodeURIComponent(conversationId)}`, {
			query: { user_id: userId },
		})
	},

	resetConversation({ userId, conversationId }) {
		return requestJson(`/api/conversations/${encodeURIComponent(conversationId)}/reset`, {
			method: 'POST',
			query: { user_id: userId },
		})
	},
}
