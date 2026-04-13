import { internalApiBaseUrl } from '../config/chatBackend'
import type { AiAccessPlan, AiAccessResponse } from '../types'

export interface VkAiSource {
	type: string
	name: string
}

export interface VkAiChatResponse {
	reply: string
	user_id: string
	conversation_id: string
	source_type?: string
	sources?: VkAiSource[]
	message_count?: number
	transcript?: string
	audio_reply_url?: string
}

export interface VkAiVoiceResponse {
	transcript: string
	reply: string
	source_type?: string
	sources?: VkAiSource[]
	audio_reply_url?: string
	conversation_id: string
	user_id: string
}

export interface VkAiConversationResponse {
	user_id: string
	conversation_id: string
	message_count: number
	messages: Array<{ role: 'user' | 'assistant'; content: string }>
	files?: string[]
	voice_records?: string[]
}

export interface VkAiUploadResponse {
	file_id: string
	filename: string
	status: string
	extracted_chars?: number
}

type VkAiError = Error & {
	status?: number
	code?: string | null
	details?: unknown
}

const apiBaseUrl = internalApiBaseUrl || ''

const createHeaders = (accessToken: string, headers: Record<string, string> = {}) => {
	if (!accessToken) {
		throw new Error('Требуется авторизация')
	}

	return {
		Authorization: `Bearer ${accessToken}`,
		...headers,
	}
}

const createVkAiError = (message: string, options: { status?: number; code?: string | null; details?: unknown } = {}) =>
	Object.assign(new Error(message), options) as VkAiError

const readErrorPayload = async (response: Response) => {
	try {
		return await response.json()
	} catch {
		return null
	}
}

const getErrorCode = (payload: Record<string, unknown> | null) => {
	const details = payload?.details
	if (details && typeof details === 'object' && typeof (details as Record<string, unknown>).code === 'string') {
		return String((details as Record<string, unknown>).code)
	}

	if (typeof payload?.code === 'string') return payload.code
	return null
}

const getErrorMessage = (payload: Record<string, unknown> | null, status: number) => {
	if (typeof payload?.message === 'string' && payload.message.trim()) return payload.message

	const details = payload?.details
	if (details && typeof details === 'object') {
		const detailsRecord = details as Record<string, unknown>
		if (typeof detailsRecord.upstreamMessage === 'string' && detailsRecord.upstreamMessage.trim()) {
			return detailsRecord.upstreamMessage
		}
	}

	return `HTTP ${status}`
}

const ensureOk = async (response: Response) => {
	if (response.ok) return response

	const payload = (await readErrorPayload(response)) as Record<string, unknown> | null
	throw createVkAiError(getErrorMessage(payload, response.status), {
		status: response.status,
		code: getErrorCode(payload),
		details: payload?.details || null,
	})
}

export const getVkAiErrorCode = (error: unknown) =>
	(error as { code?: string | null; details?: { code?: string | null } | null })?.code ||
	(error as { details?: { code?: string | null } | null })?.details?.code ||
	null

export const vkAiApi = {
	async getPlans(accessToken: string) {
		const response = await fetch(`${apiBaseUrl}/api/ai/plans`, {
			headers: createHeaders(accessToken),
		})
		await ensureOk(response)
		return response.json() as Promise<AiAccessPlan[]>
	},

	async getAccess(accessToken: string) {
		const response = await fetch(`${apiBaseUrl}/api/ai/access`, {
			headers: createHeaders(accessToken),
		})
		await ensureOk(response)
		return response.json() as Promise<AiAccessResponse>
	},

	async chat(payload: { accessToken: string; conversationId: string; message: string }) {
		const response = await fetch(`${apiBaseUrl}/api/ai/chat`, {
			method: 'POST',
			headers: createHeaders(payload.accessToken, { 'Content-Type': 'application/json' }),
			body: JSON.stringify({
				conversationId: payload.conversationId,
				message: payload.message,
			}),
		})
		await ensureOk(response)
		return response.json() as Promise<VkAiChatResponse>
	},

	async uploadFile(payload: { accessToken: string; conversationId: string; file: File }) {
		const formData = new FormData()
		formData.set('conversationId', payload.conversationId)
		formData.set('file', payload.file)

		const response = await fetch(`${apiBaseUrl}/api/ai/files/upload`, {
			method: 'POST',
			headers: createHeaders(payload.accessToken),
			body: formData,
		})
		await ensureOk(response)
		return response.json() as Promise<VkAiUploadResponse>
	},

	async sendVoice(payload: { accessToken: string; conversationId: string; audio: File }) {
		const formData = new FormData()
		formData.set('conversationId', payload.conversationId)
		formData.set('audio', payload.audio)

		const response = await fetch(`${apiBaseUrl}/api/ai/voice`, {
			method: 'POST',
			headers: createHeaders(payload.accessToken),
			body: formData,
		})
		await ensureOk(response)
		return response.json() as Promise<VkAiVoiceResponse>
	},

	async getConversation(payload: { accessToken: string; conversationId: string }) {
		const response = await fetch(`${apiBaseUrl}/api/ai/conversations/${encodeURIComponent(payload.conversationId)}`, {
			headers: createHeaders(payload.accessToken),
		})
		await ensureOk(response)
		return response.json() as Promise<VkAiConversationResponse>
	},

	async resetConversation(payload: { accessToken: string; conversationId: string }) {
		const response = await fetch(`${apiBaseUrl}/api/ai/conversations/${encodeURIComponent(payload.conversationId)}/reset`, {
			method: 'POST',
			headers: createHeaders(payload.accessToken),
		})
		await ensureOk(response)
		return response.json() as Promise<{ status: string; user_id: string; conversation_id: string }>
	},
}
