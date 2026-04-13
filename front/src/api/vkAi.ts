import { resolveVkAiMediaUrl, vkAiApiBaseUrl, vkAiApiKey } from '../config/chatBackend'

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

const createHeaders = (headers: Record<string, string> = {}) => ({
	'X-API-Key': vkAiApiKey,
	...headers,
})

const getDetail = async (response: Response) => {
	try {
		const payload = await response.json()
		return payload?.detail || payload?.message || `HTTP ${response.status}`
	} catch {
		return `HTTP ${response.status}`
	}
}

export const vkAiApi = {
	async health() {
		const response = await fetch(`${vkAiApiBaseUrl}/api/health`, {
			headers: createHeaders(),
		})
		if (!response.ok) throw new Error(await getDetail(response))
		return response.json() as Promise<{ status: string }>
	},

	async chat(payload: { userId: string; conversationId: string; message: string }) {
		const response = await fetch(`${vkAiApiBaseUrl}/api/chat`, {
			method: 'POST',
			headers: createHeaders({ 'Content-Type': 'application/json' }),
			body: JSON.stringify({
				user_id: payload.userId,
				conversation_id: payload.conversationId,
				message: payload.message,
			}),
		})
		if (!response.ok) throw new Error(await getDetail(response))

		const data = (await response.json()) as VkAiChatResponse
		if (data.audio_reply_url) {
			data.audio_reply_url = resolveVkAiMediaUrl(data.audio_reply_url)
		}
		return data
	},

	async uploadFile(payload: { userId: string; conversationId: string; file: File }) {
		const formData = new FormData()
		formData.set('user_id', payload.userId)
		formData.set('conversation_id', payload.conversationId)
		formData.set('file', payload.file)

		const response = await fetch(`${vkAiApiBaseUrl}/api/files/upload`, {
			method: 'POST',
			headers: createHeaders(),
			body: formData,
		})
		if (!response.ok) throw new Error(await getDetail(response))
		return response.json() as Promise<VkAiUploadResponse>
	},

	async sendVoice(payload: { userId: string; conversationId: string; audio: File }) {
		const formData = new FormData()
		formData.set('user_id', payload.userId)
		formData.set('conversation_id', payload.conversationId)
		formData.set('audio', payload.audio)

		const response = await fetch(`${vkAiApiBaseUrl}/api/voice`, {
			method: 'POST',
			headers: createHeaders(),
			body: formData,
		})
		if (!response.ok) throw new Error(await getDetail(response))

		const data = (await response.json()) as VkAiVoiceResponse
		if (data.audio_reply_url) {
			data.audio_reply_url = resolveVkAiMediaUrl(data.audio_reply_url)
		}
		return data
	},

	async getConversation(payload: { userId: string; conversationId: string }) {
		const query = new URLSearchParams({ user_id: payload.userId })
		const response = await fetch(`${vkAiApiBaseUrl}/api/conversations/${encodeURIComponent(payload.conversationId)}?${query}`, {
			headers: createHeaders(),
		})
		if (!response.ok) throw new Error(await getDetail(response))
		return response.json() as Promise<VkAiConversationResponse>
	},

	async resetConversation(payload: { userId: string; conversationId: string }) {
		const query = new URLSearchParams({ user_id: payload.userId })
		const response = await fetch(
			`${vkAiApiBaseUrl}/api/conversations/${encodeURIComponent(payload.conversationId)}/reset?${query}`,
			{
				method: 'POST',
				headers: createHeaders(),
			},
		)
		if (!response.ok) throw new Error(await getDetail(response))
		return response.json() as Promise<{ status: string; user_id: string; conversation_id: string }>
	},
}
