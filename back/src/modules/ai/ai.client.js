import crypto from 'node:crypto'

import env from '../../config/env.js'
import logger from '../../config/logger.js'
import { AppError } from '../../shared/errors.js'

const clientLogger = logger.createChild({ module: 'ai-client' })

const sanitizeUrl = value =>
	String(value || '')
		.trim()
		.replace(/\/+$/, '')
const getBaseUrl = () => sanitizeUrl(env.vkAiBackendUrl)
const getApiKey = () => String(env.vkAiBackendApiKey || '').trim()

const MIN_TIMEOUT_MS = 60000
const DEFAULT_TIMEOUT_MS = 60000
const CHAT_RETRY_ATTEMPTS = 2

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

const getTimeoutMs = () => Math.max(Number(env.vkAiBackendTimeoutMs) || DEFAULT_TIMEOUT_MS, MIN_TIMEOUT_MS)

const isRetriableAppError = error =>
	error instanceof AppError &&
	error.details &&
	typeof error.details === 'object' &&
	(error.details.reason === 'timeout' ||
		error.details.reason === 'network_error' ||
		(error.details.upstreamStatus && Number(error.details.upstreamStatus) >= 500))

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const withTimeout = async fn => {
	const controller = new AbortController()
	const timeoutId = setTimeout(() => controller.abort(), getTimeoutMs())

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
			reason: 'upstream_5xx',
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

const requestJson = async (
	path,
	{ method = 'GET', body = null, query = null, retryAttempts = 1, retryDelayMs = 700 } = {},
) => {
	ensureConfigured()

	const execute = async () => {
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

	let lastError = null

	for (let attempt = 1; attempt <= retryAttempts; attempt += 1) {
		try {
			return await execute()
		} catch (error) {
			lastError = error

			const shouldRetry = attempt < retryAttempts && isRetriableAppError(error)
			if (!shouldRetry) {
				throw error
			}

			clientLogger.warn('Retrying AI backend request', {
				path,
				method,
				attempt,
				retryAttempts,
				reason: error?.details?.reason || error?.message || 'unknown',
			})

			await sleep(retryDelayMs * attempt)
		}
	}

	throw lastError
}

const requestFormData = async (path, formData, { method = 'POST', retryAttempts = 1, retryDelayMs = 700 } = {}) => {
	ensureConfigured()

	const execute = async () =>
		withTimeout(signal =>
			fetch(`${getBaseUrl()}${path}`, {
				method,
				headers: buildHeaders(),
				body: formData,
				signal,
			}).then(parseJson),
		)

	let lastError = null

	for (let attempt = 1; attempt <= retryAttempts; attempt += 1) {
		try {
			return await execute()
		} catch (error) {
			lastError = error

			const shouldRetry = attempt < retryAttempts && isRetriableAppError(error)
			if (!shouldRetry) {
				throw error
			}

			clientLogger.warn('Retrying AI backend form-data request', {
				path,
				method,
				attempt,
				retryAttempts,
				reason: error?.details?.reason || error?.message || 'unknown',
			})

			await sleep(retryDelayMs * attempt)
		}
	}

	throw lastError
}

export const aiClient = {
	health() {
		return requestJson('/api/health')
	},

	keyCheck() {
		return requestJson('/api/key/check')
	},

	simpleChat({ message }) {
		return requestJson('/api/chat/simple', {
			method: 'POST',
			body: {
				message,
			},
			retryAttempts: CHAT_RETRY_ATTEMPTS,
		})
	},

	chat({ userId, conversationId, message, sessionContext }) {
		void sessionContext
		return requestJson('/api/chat', {
			method: 'POST',
			body: {
				user_id: userId,
				conversation_id: conversationId,
				message,
			},
			retryAttempts: CHAT_RETRY_ATTEMPTS,
		})
	},

	uploadFile({ userId, conversationId, file }) {
		const formData = new FormData()
		formData.set('user_id', userId)
		formData.set('conversation_id', conversationId)
		formData.set('file', file, file.name || 'upload.bin')
		return requestFormData('/api/upload', formData)
	},

	voice({ userId, conversationId, file }) {
		const formData = new FormData()
		formData.set('user_id', userId)
		formData.set('conversation_id', conversationId)
		formData.set('audio', file, file.name || 'voice.webm')
		return requestFormData('/api/voice', formData)
	},

	getConversation({ userId, conversationId }) {
		void userId
		return requestJson(`/api/conversations/${encodeURIComponent(conversationId)}`)
	},

	resetConversation({ userId, conversationId }) {
		void userId
		return requestJson(`/api/conversations/${encodeURIComponent(conversationId)}/reset`, {
			method: 'POST',
		})
	},
}
