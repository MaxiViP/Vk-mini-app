export type ChatBackendMode = 'internal' | 'vk-ai'
export type VkAiChatMode = 'context' | 'simple'

const rawMode = String(import.meta.env.VITE_CHAT_BACKEND_MODE || 'internal').toLowerCase()
const rawVkAiChatMode = String(import.meta.env.VITE_AIVK_CHAT_MODE || 'context').toLowerCase()

export const chatBackendMode: ChatBackendMode = rawMode === 'vk-ai' ? 'vk-ai' : 'internal'
export const isVkAiBackend = chatBackendMode === 'vk-ai'
export const vkAiChatMode: VkAiChatMode = rawVkAiChatMode === 'simple' ? 'simple' : 'context'

export const internalApiBaseUrl = import.meta.env.VITE_API_BASE_URL || ''
