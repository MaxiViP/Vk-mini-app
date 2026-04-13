export const PAYG_PRICING_MINOR = {
	basic: 500,
	premium: 500,
}

export const PLAN_CATALOG = [
	{
		code: 'weekly-basic',
		name: 'Базовая подписка',
		productType: 'core',
		priceMinor: 34900,
		intervalDays: 7,
		includedRequests: 700,
		accessTier: 'basic',
		isActive: true,
	},
	{
		code: 'monthly-premium',
		name: 'Премиум подписка',
		productType: 'core',
		priceMinor: 199000,
		intervalDays: 30,
		includedRequests: 2500,
		accessTier: 'premium',
		isActive: true,
	},
]

export const AI_PLAN_CATALOG = [
	{
		code: 'ai-start',
		name: 'AI Start',
		productType: 'ai',
		priceMinor: 29900,
		intervalDays: 30,
		includedRequests: 0,
		accessTier: 'basic',
		aiChatLimit: 300,
		aiVoiceLimit: 30,
		aiFileUploadLimit: 20,
		isActive: true,
	},
	{
		code: 'ai-pro',
		name: 'AI Pro',
		productType: 'ai',
		priceMinor: 79900,
		intervalDays: 30,
		includedRequests: 0,
		accessTier: 'premium',
		aiChatLimit: 1500,
		aiVoiceLimit: 150,
		aiFileUploadLimit: 100,
		isActive: true,
	},
]

export const ALL_PLAN_CATALOG = [...PLAN_CATALOG, ...AI_PLAN_CATALOG]

const BASIC_MODEL_MATCHERS = [
	'gpt-4o-mini',
	'gpt-4.1-mini',
	'llama-3.1-8b',
	'llama 3.1 8b',
	'qwen-2.5-7b',
	'mistral-small',
	'small',
	'mini',
	'8b',
]

const PREMIUM_MODEL_MATCHERS = [
	'my-marketing',
	'my-legal',
	'llama-3.3-70b',
	'70b',
	'claude',
	'gpt-4.1',
	'gpt-4o',
]

const getSearchableValue = model =>
	`${model?.id || ''} ${model?.model || ''} ${model?.name || ''} ${model?.provider || ''}`.toLowerCase()

export const resolveModelTier = model => {
	const value = getSearchableValue(model)

	for (const matcher of BASIC_MODEL_MATCHERS) {
		if (value.includes(matcher)) return 'basic'
	}

	for (const matcher of PREMIUM_MODEL_MATCHERS) {
		if (value.includes(matcher)) return 'premium'
	}

	return model?.provider === 'local' ? 'premium' : 'basic'
}

export const isTierCoveredByPlan = (planTier, modelTier) => {
	if (!planTier) return false
	if (planTier === 'premium') return true
	return planTier === modelTier
}

export const formatMoneyMinor = amountMinor => Number(amountMinor || 0) / 100
