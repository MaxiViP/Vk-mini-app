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

export type ProductType = 'core' | 'ai'

export interface AppliedDiscount {
	id: string
	code: string | null
	name: string
	description?: string | null
	type: 'percent' | 'fixed_minor' | 'topup_bonus_percent' | 'topup_bonus_fixed_minor'
	value: number
	isAutomatic: boolean
	productType?: string | null
	planCode?: string | null
	allowStacking?: boolean
}

export interface DiscountRedemption {
	id: string
	applicationType: 'subscription_purchase' | 'wallet_topup'
	promoCodeSnapshot: string | null
	baseAmountMinor: number
	discountAmountMinor: number
	finalAmountMinor: number
	createdAt: string
	discount: AppliedDiscount | null
}

export interface ChatHistoryItem {
	role: 'user' | 'assistant'
	content: string
}

export interface BillingPlan {
	id: string
	code: string
	name: string
	productType?: ProductType
	priceMinor: number
	price: number
	intervalDays: number
	includedRequests: number
	accessTier: 'basic' | 'premium'
	aiChatLimit?: number | null
	aiVoiceLimit?: number | null
	aiFileUploadLimit?: number | null
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
	creditedAmountMinor?: number
	creditedAmount?: number
	bonusAmountMinor?: number
	bonusAmount?: number
	promoCodeSnapshot?: string | null
	appliedDiscount?: AppliedDiscount | null
	createdAt: string
	updatedAt: string
}

export interface SubscriptionPurchasePreview {
	basePriceMinor: number
	discountMinor: number
	finalPriceMinor: number
	appliedDiscount: AppliedDiscount | null
	message?: string | null
}

export interface SubscriptionPurchaseResult extends SubscriptionPurchasePreview {
	subscription: BillingSubscription
	balanceMinor: number
	idempotentReplay: boolean
}

export interface TopupPreview {
	baseAmountMinor: number
	bonusMinor: number
	creditedAmountMinor: number
	appliedDiscount: AppliedDiscount | null
	message?: string | null
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
	automaticDiscounts?: AppliedDiscount[]
	recentDiscounts?: DiscountRedemption[]
	legacyBillingMode?: boolean
}

export interface AiAccessSubscription {
	id: string
	status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'expired'
	startedAt: string
	expiresAt: string
	cancelAtPeriodEnd: boolean
}

export interface AiAccessPlan {
	id: string
	code: string
	name: string
	productType: 'core' | 'ai'
	priceMinor: number
	intervalDays: number
	includedRequests: number
	accessTier: 'basic' | 'premium'
	aiChatLimit: number | null
	aiVoiceLimit: number | null
	aiFileUploadLimit: number | null
	isActive: boolean
}

export interface AiAccessCounters {
	chat: number
	voice: number
	fileUpload: number
}

export interface AiAccessCapabilities {
	chat: boolean
	voice: boolean
	fileUpload: boolean
}

export interface AiAccessResponse {
	hasAccess: boolean
	subscription: AiAccessSubscription | null
	plan: AiAccessPlan | null
	limits: AiAccessCounters
	usage: AiAccessCounters
	remaining: AiAccessCounters
	capabilities: AiAccessCapabilities
}

export interface YooKassaPaymentSession {
	paymentId: string
	amount: number
	baseAmountMinor?: number
	bonusMinor?: number
	creditedAmountMinor?: number
	status: 'pending' | 'succeeded' | 'failed' | 'canceled'
	confirmationUrl: string
	qrCodeDataUrl: string
	qrPayload: string
	isStub: boolean
	provider?: 'yookassa'
	appliedDiscount?: AppliedDiscount | null
}
