export interface Model {
	id: string
	name: string
	provider: 'openai' | 'groq' | 'openrouter' | 'cloudflare' | 'local' | 'cerebras' | 'vercel' | 'mistral' | 'github'
	model: string
	baseUrl?: string
	billingTier?: 'basic' | 'premium'
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
	photo_100?: string
	avatarUrl?: string
	balance: number
	requestsLeft: number
	phoneE164?: string
	isAdmin?: boolean
}

export interface ChatHistoryItem {
	role: 'user' | 'assistant'
	content: string
}

export interface BillingPlan {
	id: string
	code: string
	name: string
	priceMinor: number
	price: number
	intervalDays: number
	includedRequests: number
	accessTier: 'basic' | 'premium'
	isActive: boolean
}

export interface BillingSubscription {
	id: string
	status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'expired'
	startedAt: string
	expiresAt: string
	cancelAtPeriodEnd: boolean
	includedRequests: number
	usedRequests: number
	remainingRequests: number
	plan: BillingPlan | null
}

export interface BillingLedgerEntry {
	id: string
	type: 'credit' | 'debit' | 'hold' | 'release' | 'refund'
	reason: 'payment_topup' | 'usage_charge' | 'admin_adjust' | 'subscription_purchase'
	amountMinor: number
	amount: number
	referenceType?: string | null
	referenceId?: string | null
	createdAt: string
}

export interface BillingPayment {
	id: string
	provider: 'yookassa'
	status: 'pending' | 'succeeded' | 'failed' | 'canceled'
	amountMinor: number
	amount: number
	createdAt: string
	updatedAt: string
}

export interface BillingSummary {
	wallet: {
		balanceMinor: number
		balance: number
		currency: string
	}
	activeSubscription: BillingSubscription | null
	plans: BillingPlan[]
	paygPricing: {
		basicMinor: number
		basic: number
		premiumMinor: number
		premium: number
	}
	usageSnapshot: {
		remainingIncludedRequests: number
		mode: string
	}
	recentLedger: BillingLedgerEntry[]
	recentPayments: BillingPayment[]
}

export interface YooKassaPaymentSession {
	paymentId: string
	amount: number
	status: 'pending' | 'succeeded' | 'failed' | 'canceled'
	confirmationUrl: string
	qrCodeDataUrl: string
	qrPayload: string
	isStub: boolean
	provider?: 'yookassa'
}
