export type ChatBackendMode = 'internal' | 'vk-ai'

const rawMode = String(import.meta.env.VITE_CHAT_BACKEND_MODE || 'internal').toLowerCase()

export const chatBackendMode: ChatBackendMode = rawMode === 'vk-ai' ? 'vk-ai' : 'internal'
export const isVkAiBackend = chatBackendMode === 'vk-ai'

export const internalApiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'
export const vkAiApiBaseUrl = import.meta.env.VITE_VK_AI_API_URL || 'http://localhost:8000'
export const vkAiApiKey = import.meta.env.VITE_VK_AI_API_KEY || 'default-dev-key'

export const resolveVkAiMediaUrl = (value?: string | null) => {
	if (!value) return ''
	try {
		return new URL(value, vkAiApiBaseUrl).toString()
	} catch {
		return value
	}
}
