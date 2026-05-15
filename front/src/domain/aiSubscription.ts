import type { AiAccessCapabilities, AiAccessCounters, AiAccessResponse, AiAccessSubscription } from '../types'

const ACTIVE_AI_SUBSCRIPTION_STATUSES = new Set<AiAccessSubscription['status']>(['active', 'trialing', 'past_due'])

const toTimestamp = (value?: string | null) => {
	if (!value) return 0

	const timestamp = new Date(value).getTime()
	return Number.isFinite(timestamp) ? timestamp : 0
}

const toCounter = (value: unknown) => {
	const numeric = Number(value ?? 0)
	return Number.isFinite(numeric) ? Math.max(numeric, 0) : 0
}

export const emptyAiCounters = (): AiAccessCounters => ({
	chat: 0,
	voice: 0,
	fileUpload: 0,
})

export const emptyAiCapabilities = (): AiAccessCapabilities => ({
	chat: false,
	voice: false,
	fileUpload: false,
})

export const normalizeAiCounters = (counters?: Partial<AiAccessCounters> | null): AiAccessCounters => ({
	chat: toCounter(counters?.chat),
	voice: toCounter(counters?.voice),
	fileUpload: toCounter(counters?.fileUpload),
})

export const buildAiCapabilities = (limits: AiAccessCounters): AiAccessCapabilities => ({
	chat: limits.chat > 0,
	voice: limits.voice > 0,
	fileUpload: limits.fileUpload > 0,
})

export const isAiSubscriptionActive = (access?: AiAccessResponse | AiAccessSubscription | null) => {
	if (!access) return false

	const hasAccessFlag = 'hasAccess' in access ? Boolean(access.hasAccess) : true
	const subscription = 'subscription' in access ? access.subscription : access
	if (!hasAccessFlag || !subscription) return false
	if (!ACTIVE_AI_SUBSCRIPTION_STATUSES.has(subscription.status)) return false

	const expiresAt = toTimestamp(subscription.expiresAt)
	return expiresAt > Date.now()
}

export const normalizeAiAccess = (access: AiAccessResponse | null): AiAccessResponse | null => {
	if (!access) return null

	const active = isAiSubscriptionActive(access)
	const limits = active ? normalizeAiCounters(access.limits) : emptyAiCounters()
	const usage = active ? normalizeAiCounters(access.usage) : emptyAiCounters()
	const remaining = active ? normalizeAiCounters(access.remaining) : emptyAiCounters()
	const capabilities = active ? buildAiCapabilities(limits) : emptyAiCapabilities()

	return {
		...access,
		hasAccess: active,
		plan: active ? access.plan : null,
		limits,
		usage,
		remaining,
		capabilities,
	}
}
