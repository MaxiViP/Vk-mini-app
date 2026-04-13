export type ChatBackendMode = 'internal' | 'vk-ai'

const rawMode = String(import.meta.env.VITE_CHAT_BACKEND_MODE || 'internal').toLowerCase()

export const chatBackendMode: ChatBackendMode = rawMode === 'vk-ai' ? 'vk-ai' : 'internal'
export const isVkAiBackend = chatBackendMode === 'vk-ai'

export const internalApiBaseUrl = import.meta.env.VITE_API_BASE_URL || ''
