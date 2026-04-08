// src/types.ts

export interface Model {
	id: string
	name: string
	provider: 'openai' | 'groq' | 'openrouter' | 'cloudflare' | 'local'
	model: string
	baseUrl?: string // для локальных моделей
}

export interface MessageSource {
	type: string
	name: string
}

export interface MessageMeta {
	sourceType?: string
	sources?: MessageSource[]
	transcript?: string
	audioReplyUrl?: string
	fileName?: string
	statusLabel?: string
}

export interface SourceHistoryItem {
	id: string
	timestamp: number
	sourceType?: string
	sources: MessageSource[]
	replyPreview: string
	transcript?: string
}

export interface Message {
	role: 'user' | 'assistant'
	content: string
	timestamp?: number
	meta?: MessageMeta
}

export interface User {
	vkId: string
	firstName: string
	lastName: string
	photo_200?: string
	balance: number
	requestsLeft: number
	phoneE164?: string
	isAdmin?: boolean
}

export interface ChatHistoryItem {
	role: 'user' | 'assistant'
	content: string
}

export interface YooKassaPaymentSession {
	paymentId: string
	amount: number
	status: 'pending' | 'succeeded'
	confirmationUrl: string
	qrCodeDataUrl: string
	qrPayload: string
	isStub: boolean
	provider?: 'yookassa-stub' | 'yookassa'
}
