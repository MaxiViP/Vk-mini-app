// src/types.ts

export interface Model {
	id: string
	name: string
	provider: 'openai' | 'groq' | 'openrouter' | 'cloudflare' | 'local'
	model: string
	baseUrl?: string // для локальных моделей
}

export interface Message {
	role: 'user' | 'assistant'
	content: string
	timestamp?: number
}

export interface User {
	vkId: string
	firstName: string
	lastName: string
	photo_200?: string
	balance: number
	requestsLeft: number
}

export interface ChatHistoryItem {
	role: 'user' | 'assistant'
	content: string
}
