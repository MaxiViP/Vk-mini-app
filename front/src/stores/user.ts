import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import bridge from '@vkontakte/vk-bridge'

import type {
	AiAccessPlan,
	AiAccessResponse,
	BillingSummary,
	SubscriptionPurchasePreview,
	SubscriptionPurchaseResult,
	TopupPreview,
	User,
	YooKassaPaymentSession,
} from '../types'
import { getVkAiErrorCode, vkAiApi } from '../api/vkAi'
import { billingApi } from '../api/billing'
import {
	buildAiCapabilities,
	emptyAiCapabilities,
	emptyAiCounters,
	isAiSubscriptionActive as resolveIsAiSubscriptionActive,
	normalizeAiAccess,
	normalizeAiCounters,
} from '../domain/aiSubscription'
import {
	confirmYooKassaPaymentRequest,
	createYooKassaPaymentRequest,
	previewYooKassaPaymentRequest,
} from '../api/payments'
import { authApi, type OAuthProvider, type UserProfileResponse } from '../services/auth'
import {
	BILLING_STORAGE_KEY,
	REFRESH_TOKEN_STORAGE_KEY,
	TOKEN_STORAGE_KEY,
	USER_STORAGE_KEY,
	isDevSessionRefreshToken,
} from '../services/authSession'
import { clearOAuthCallbackFromLocation, readOAuthCallbackFromLocation } from '../utils/oauthCallback'

const LEGACY_STORAGE_KEYS = ['token', 'refresh_token', 'user_profile', 'billing_summary']

const safeParse = <T>(raw: string | null): T | null => {
	if (!raw) return null
	try {
		return JSON.parse(raw) as T
	} catch {
		return null
	}
}

const getHttpStatus = (error: unknown) => (error as { response?: { status?: number } })?.response?.status || null
const isUnauthorizedError = (error: unknown) => getHttpStatus(error) === 401
export { isDevSessionRefreshToken }

const createEmptyAiAccess = (
	status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'expired' | null = null,
): AiAccessResponse => ({
	hasAccess: false,
	subscription: status
		? {
				id: '',
				status,
				startedAt: '',
				expiresAt: '',
				cancelAtPeriodEnd: false,
			}
		: null,
	plan: null,
	limits: emptyAiCounters(),
	usage: emptyAiCounters(),
	remaining: emptyAiCounters(),
	capabilities: emptyAiCapabilities(),
})

const createAiAccessFromPurchase = (result: SubscriptionPurchaseResult): AiAccessResponse | null => {
	const plan = result.subscription.plan
	if (plan?.productType !== 'ai') return null

	const limits = normalizeAiCounters({
		chat: plan.aiChatLimit,
		voice: plan.aiVoiceLimit,
		fileUpload: plan.aiFileUploadLimit,
	})

	const access = normalizeAiAccess({
		hasAccess: true,
		subscription: {
			id: result.subscription.id,
			status: result.subscription.status,
			startedAt: result.subscription.startedAt,
			expiresAt: result.subscription.expiresAt,
			cancelAtPeriodEnd: result.subscription.cancelAtPeriodEnd,
		},
		plan: {
			id: plan.id,
			code: plan.code,
			name: plan.name,
			productType: 'ai',
			priceMinor: plan.priceMinor,
			intervalDays: plan.intervalDays,
			includedRequests: plan.includedRequests,
			accessTier: plan.accessTier,
			aiChatLimit: plan.aiChatLimit ?? null,
			aiVoiceLimit: plan.aiVoiceLimit ?? null,
			aiFileUploadLimit: plan.aiFileUploadLimit ?? null,
			isActive: plan.isActive,
		},
		limits,
		usage: emptyAiCounters(),
		remaining: limits,
		capabilities: buildAiCapabilities(limits),
	})

	return access
}

const DEFAULT_FALLBACK_PLANS = [
	{
		id: 'fallback-weekly-basic',
		code: 'weekly-basic',
		name: 'Базовая подписка',
		priceMinor: 34900,
		price: 349,
		intervalDays: 7,
		includedRequests: 700,
		accessTier: 'basic' as const,
		isActive: true,
	},
	{
		id: 'fallback-monthly-premium',
		code: 'monthly-premium',
		name: 'Премиум подписка',
		priceMinor: 199000,
		price: 1990,
		intervalDays: 30,
		includedRequests: 2500,
		accessTier: 'premium' as const,
		isActive: true,
	},
]

const createFallbackBillingSummary = (
	profile: UserProfileResponse,
	previousBilling: BillingSummary | null,
): BillingSummary => {
	const balanceMinor = Number(profile.wallet?.balanceMinor || 0)

	return {
		wallet: {
			balanceMinor,
			balance: balanceMinor / 100,
			currency: profile.wallet?.currency || previousBilling?.wallet.currency || 'RUB',
		},
		activeSubscription: previousBilling?.activeSubscription || null,
		plans: previousBilling?.plans?.length ? previousBilling.plans : DEFAULT_FALLBACK_PLANS,
		paygPricing: previousBilling?.paygPricing || {
			basicMinor: 500,
			basic: 5,
			premiumMinor: 500,
			premium: 5,
		},
		usageSnapshot: {
			remainingIncludedRequests: previousBilling?.usageSnapshot.remainingIncludedRequests || 0,
			mode: previousBilling?.usageSnapshot.mode || 'payg',
		},
		recentLedger: previousBilling?.recentLedger || [],
		recentPayments: previousBilling?.recentPayments || [],
		automaticDiscounts: previousBilling?.automaticDiscounts || [],
		recentDiscounts: previousBilling?.recentDiscounts || [],
		legacyBillingMode: true,
	}
}

const mapApiUserToUiUser = (
	apiUser: {
		id: string
		firstName: string | null
		lastName: string | null
		avatarUrl: string | null
		phoneE164: string | null
		isAdmin?: boolean
		wallet?: { balanceMinor: number } | null
	},
	billing: BillingSummary | null,
): User => ({
	vkId: apiUser.id,
	firstName: apiUser.firstName || 'User',
	lastName: apiUser.lastName || '',
	photo_200: apiUser.avatarUrl || undefined,
	photo_100: apiUser.avatarUrl || undefined,
	avatarUrl: apiUser.avatarUrl || undefined,
	balance: billing ? billing.wallet.balance : Number(apiUser.wallet?.balanceMinor || 0) / 100,
	requestsLeft: billing?.usageSnapshot.remainingIncludedRequests || 0,
	phoneE164: apiUser.phoneE164 || undefined,
	isAdmin: Boolean(apiUser.isAdmin),
})

export const useUserStore = defineStore('user', () => {
	const user = ref<User | null>(safeParse<User>(localStorage.getItem(USER_STORAGE_KEY)))
	const billing = ref<BillingSummary | null>(safeParse<BillingSummary>(localStorage.getItem(BILLING_STORAGE_KEY)))
	const aiAccess = ref<AiAccessResponse | null>(null)
	const aiPlans = ref<AiAccessPlan[]>([])
	const token = ref<string | null>(localStorage.getItem(TOKEN_STORAGE_KEY))
	const refreshToken = ref<string | null>(localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY))
	const isTestMode = ref(import.meta.env.DEV || String(import.meta.env.VITE_TEST_MODE || 'false') === 'true')
	const pendingPhone = ref<string | null>(null)
	const authPending = ref(false)
	const phoneChallenge = ref<{ challengeId: string; expiresInSec: number; testCode: string | null } | null>(null)
	let sessionEventsBound = false

	const isAuthenticated = computed(() => Boolean(token.value && user.value))
	const activeSubscription = computed(() => billing.value?.activeSubscription || null)
	const isAiSubscriptionActive = computed(() => resolveIsAiSubscriptionActive(aiAccess.value))

	const persistAuthState = () => {
		if (token.value) localStorage.setItem(TOKEN_STORAGE_KEY, token.value)
		if (refreshToken.value) localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, refreshToken.value)
		if (user.value) localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user.value))
		if (billing.value) localStorage.setItem(BILLING_STORAGE_KEY, JSON.stringify(billing.value))
	}

	const clearLegacyAuthState = () => {
		for (const key of LEGACY_STORAGE_KEYS) {
			localStorage.removeItem(key)
		}
	}

	const clearAuthState = () => {
		localStorage.removeItem(TOKEN_STORAGE_KEY)
		localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY)
		localStorage.removeItem(USER_STORAGE_KEY)
		localStorage.removeItem(BILLING_STORAGE_KEY)
	}

	const dropLocalSession = () => {
		user.value = null
		billing.value = null
		aiAccess.value = null
		aiPlans.value = []
		token.value = null
		refreshToken.value = null
		pendingPhone.value = null
		phoneChallenge.value = null
		clearAuthState()
	}

	const syncTokensFromStorage = () => {
		token.value = localStorage.getItem(TOKEN_STORAGE_KEY)
		refreshToken.value = localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)
	}

	const bindSessionEvents = () => {
		if (sessionEventsBound || typeof window === 'undefined') return

		window.addEventListener('auth-session-updated', syncTokensFromStorage)
		window.addEventListener('auth-session-cleared', dropLocalSession)
		sessionEventsBound = true
	}

	const applyBillingSummary = (summary: BillingSummary | null) => {
		billing.value = summary
		if (user.value && summary) {
			user.value.balance = summary.wallet.balance
			user.value.requestsLeft = summary.usageSnapshot.remainingIncludedRequests
		}
		persistAuthState()
	}

	const applyLocalTopupFallback = (
		creditedAmount: number,
		paymentId: string,
		options: {
			bonusAmountMinor?: number
			appliedDiscount?: YooKassaPaymentSession['appliedDiscount']
		} = {},
	) => {
		const amountMinor = Math.round(creditedAmount * 100)
		const amount = creditedAmount
		const now = new Date().toISOString()

		if (billing.value) {
			applyBillingSummary({
				...billing.value,
				wallet: {
					...billing.value.wallet,
					balanceMinor: billing.value.wallet.balanceMinor + amountMinor,
					balance: billing.value.wallet.balance + creditedAmount,
				},
				recentPayments: [
					{
						id: paymentId,
						provider: 'yookassa',
						status: 'succeeded',
						amountMinor,
						amount: creditedAmount,
						creditedAmountMinor: amountMinor,
						creditedAmount: creditedAmount,
						bonusAmountMinor: options.bonusAmountMinor || 0,
						bonusAmount: Number(options.bonusAmountMinor || 0) / 100,
						appliedDiscount: options.appliedDiscount || null,
						createdAt: now,
						updatedAt: now,
					},
					...billing.value.recentPayments,
				].slice(0, 20),
				recentLedger: [
					{
						id: `local_topup_${paymentId}`,
						type: 'credit',
						reason: 'payment_topup',
						amountMinor,
						amount,
						referenceType: 'payment',
						referenceId: paymentId,
						createdAt: now,
					},
					...billing.value.recentLedger,
				].slice(0, 20),
			})
			return
		}

		if (user.value) {
			user.value.balance += amount
			persistAuthState()
		}
	}

	const applyAuthResult = (result: {
		accessToken: string
		refreshToken: string
		user: {
			id: string
			firstName: string | null
			lastName: string | null
			avatarUrl: string | null
			phoneE164: string | null
			isAdmin?: boolean
			wallet?: { balanceMinor: number } | null
		}
	}) => {
		token.value = result.accessToken
		refreshToken.value = result.refreshToken
		user.value = mapApiUserToUiUser(result.user, billing.value)
		persistAuthState()
	}

	const syncProfileFromServer = async () => {
		if (!token.value) return

		let profile: UserProfileResponse
		try {
			profile = await authApi.getMe(token.value)
		} catch (error) {
			if (isUnauthorizedError(error)) {
				dropLocalSession()
			}
			throw error
		}
		let summary: BillingSummary

		try {
			summary = await billingApi.getSummary(token.value)
		} catch (error) {
			if (isUnauthorizedError(error)) {
				dropLocalSession()
				throw error
			}
			console.warn('Billing summary fallback activated:', error)
			summary = createFallbackBillingSummary(profile, billing.value)
		}

		billing.value = summary
		user.value = mapApiUserToUiUser(profile, summary)
		persistAuthState()

		return { profile, summary }
	}

	const syncProfileAfterAuth = async () => {
		try {
			return await syncProfileFromServer()
		} catch (error) {
			if (isUnauthorizedError(error)) {
				throw error
			}
			console.warn('Post-auth profile sync skipped:', error)
			return null
		}
	}

	const refreshBillingState = async () => {
		if (!token.value) return null

		try {
			const summary = await billingApi.getSummary(token.value)
			applyBillingSummary(summary)
			return summary
		} catch (error) {
			if (isUnauthorizedError(error)) {
				dropLocalSession()
				throw error
			}
			console.warn('Billing refresh fallback activated:', error)

			let profile: UserProfileResponse
			try {
				profile = await authApi.getMe(token.value)
			} catch (error) {
				if (isUnauthorizedError(error)) {
					dropLocalSession()
				}
				throw error
			}
			const summary = createFallbackBillingSummary(profile, billing.value)
			applyBillingSummary(summary)
			return summary
		}
	}

	function hydrateAuth() {
		bindSessionEvents()

		if (!localStorage.getItem(TOKEN_STORAGE_KEY) && !localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)) {
			clearLegacyAuthState()
		}

		token.value = localStorage.getItem(TOKEN_STORAGE_KEY)
		refreshToken.value = localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)
		user.value = safeParse<User>(localStorage.getItem(USER_STORAGE_KEY))
		billing.value = safeParse<BillingSummary>(localStorage.getItem(BILLING_STORAGE_KEY))

		if (user.value) {
			if (billing.value) {
				user.value.balance = billing.value.wallet.balance
				user.value.requestsLeft = billing.value.usageSnapshot.remainingIncludedRequests
			}
			persistAuthState()
			void syncProfileFromServer().catch(error => {
				console.warn('Profile sync failed:', error)
			})
		}
	}

	async function loginByProvider(provider: OAuthProvider, options?: { redirectUri?: string }) {
		authPending.value = true
		try {
			const redirectUri = options?.redirectUri || `${window.location.origin}/oauth/${provider}/callback`
			const start = await authApi.startOAuth(provider, redirectUri)

			if (provider === 'vk' && isTestMode.value) {
				const finalize = await authApi.finalizeOAuth({
					provider,
					code: 'dev-oauth-code',
					state: start.state,
				})
				applyAuthResult(finalize)
				await syncProfileAfterAuth()
				return finalize
			}

			window.location.href = start.authUrl
			return start
		} finally {
			authPending.value = false
		}
	}

	async function initVKUser() {
		if (token.value && user.value) return

		if (isTestMode.value) {
			await loginByProvider('vk')
			return
		}

		try {
			authPending.value = true
			const vkUser = await bridge.send('VKWebAppGetUserInfo')
			const finalize = await authApi.finalizeOAuth({
				provider: 'vk',
				code: String(vkUser.id),
				state: 'vk-bridge',
			})
			applyAuthResult(finalize)
			await syncProfileAfterAuth()
		} catch (error) {
			console.error('VK init error', error)
		} finally {
			authPending.value = false
		}
	}

	async function sendPhoneCode(phone: string) {
		authPending.value = true
		try {
			pendingPhone.value = phone
			const response = await authApi.requestPhoneCode(phone)
			phoneChallenge.value = {
				challengeId: response.challengeId,
				expiresInSec: response.expiresInSec,
				testCode: response.debugCode || null,
			}
			return response
		} finally {
			authPending.value = false
		}
	}

	async function loginByPhone(code: string) {
		if (!phoneChallenge.value?.challengeId) {
			throw new Error('Сначала отправьте код на телефон')
		}

		authPending.value = true
		try {
			const result = await authApi.verifyPhoneCode({
				challengeId: phoneChallenge.value.challengeId,
				code,
			})
			applyAuthResult(result)
			await syncProfileAfterAuth()
			phoneChallenge.value = null
			return result
		} finally {
			authPending.value = false
		}
	}

	async function refreshAuth() {
		if (isDevSessionRefreshToken(refreshToken.value)) return null
		if (!refreshToken.value) throw new Error('Нет refresh token')
		let result
		try {
			result = await authApi.refresh(refreshToken.value)
		} catch (error) {
			if (isUnauthorizedError(error)) {
				dropLocalSession()
			}
			throw error
		}
		applyAuthResult(result)
		await syncProfileFromServer()
		return result
	}

	async function loadAiAccess() {
		if (!token.value) {
			aiAccess.value = null
			return null
		}

		try {
			const access = await vkAiApi.getAccess(token.value)
			const normalizedAccess = normalizeAiAccess(access)
			aiAccess.value = normalizedAccess
			return normalizedAccess
		} catch (error) {
			if (isUnauthorizedError(error)) {
				dropLocalSession()
				throw error
			}

			const code = getVkAiErrorCode(error)
			if (code === 'AI_SUBSCRIPTION_REQUIRED') {
				const fallback = normalizeAiAccess(createEmptyAiAccess())
				aiAccess.value = fallback
				return fallback
			}

			if (code === 'AI_SUBSCRIPTION_EXPIRED') {
				const fallback = normalizeAiAccess(createEmptyAiAccess('expired'))
				aiAccess.value = fallback
				return fallback
			}

			throw error
		}
	}

	async function loadAiPlans() {
		if (!token.value) {
			aiPlans.value = []
			return []
		}

		try {
			const plans = await vkAiApi.getPlans(token.value)
			aiPlans.value = plans
			return plans
		} catch (error) {
			if (isUnauthorizedError(error)) {
				dropLocalSession()
			}
			throw error
		}
	}

	async function previewSubscriptionPurchase(planCode: string, promoCode?: string): Promise<SubscriptionPurchasePreview> {
		if (!token.value) throw new Error('Требуется авторизация')

		return billingApi.previewSubscriptionPurchase(planCode, token.value, promoCode)
	}

	async function previewTopup(amount: number, promoCode?: string): Promise<TopupPreview> {
		if (!token.value) throw new Error('Требуется авторизация')

		return previewYooKassaPaymentRequest(amount, token.value, promoCode)
	}

	async function createYooKassaPayment(amount: number, promoCode?: string): Promise<YooKassaPaymentSession> {
		if (!token.value) {
			throw new Error('Требуется авторизация')
		}

		return createYooKassaPaymentRequest(amount, token.value, promoCode)
	}

	async function confirmYooKassaPayment(paymentId: string, amount: number) {
		if (!token.value) throw new Error('Требуется авторизация')

		try {
			const response = await confirmYooKassaPaymentRequest(paymentId, token.value)
			await syncProfileFromServer()
			return response
		} catch (error) {
			if (getHttpStatus(error) !== 404) throw error
			applyLocalTopupFallback(amount, paymentId)
			return {
				paymentId,
				status: 'succeeded' as const,
				amount,
				baseAmountMinor: Math.round(amount * 100),
				bonusMinor: 0,
				creditedAmountMinor: Math.round(amount * 100),
				isStub: true,
			}
		}
	}

	async function purchasePlan(planCode: string, promoCode?: string): Promise<SubscriptionPurchaseResult> {
		if (!token.value) throw new Error('Требуется авторизация')
		const idempotencyKey =
			typeof crypto !== 'undefined' && crypto.randomUUID
				? crypto.randomUUID()
				: `${Date.now()}-${Math.random().toString(16).slice(2)}`

		let response
		try {
			response = await billingApi.purchaseSubscription(planCode, token.value, idempotencyKey, promoCode)
		} catch (error) {
			if (getHttpStatus(error) === 404) {
				throw new Error('Покупка подписок появится после обновления backend на сервере.')
			}
			throw error
		}

		const optimisticAiAccess = createAiAccessFromPurchase(response)
		if (optimisticAiAccess) {
			aiAccess.value = optimisticAiAccess
		}

		try {
			await syncProfileFromServer()
		} catch (error) {
			console.warn('Post-purchase profile sync failed:', error)
		}

		if (optimisticAiAccess) {
			try {
				await loadAiAccess()
			} catch (error) {
				console.warn('Post-purchase AI access sync failed:', error)
			}
		}

		return response
	}

	async function logout() {
		try {
			if (refreshToken.value && !isDevSessionRefreshToken(refreshToken.value)) {
				await authApi.logout(refreshToken.value)
			}
		} catch (error) {
			console.warn('logout api failed:', error)
		} finally {
			dropLocalSession()
		}
	}

	async function finalizeOAuthCallbackFromLocation() {
		const callback = readOAuthCallbackFromLocation()
		if (!callback) return false

		const provider = callback.provider
		const code = callback.code
		const state = callback.state
		if (!code || !state) {
			throw new Error('OAuth callback не содержит code/state')
		}

		authPending.value = true
		try {
			const result = await authApi.finalizeOAuth({ provider, code, state })
			applyAuthResult(result)
			await syncProfileAfterAuth()
			clearOAuthCallbackFromLocation()
			return true
		} finally {
			authPending.value = false
		}
	}

	return {
		user,
		billing,
		aiAccess,
		aiPlans,
		activeSubscription,
		token,
		refreshToken,
		isTestMode,
		pendingPhone,
		authPending,
		phoneChallenge,
		isAuthenticated,
		isAiSubscriptionActive,
		hydrateAuth,
		initVKUser,
		loginByProvider,
		sendPhoneCode,
		loginByPhone,
		refreshAuth,
		loadAiAccess,
		loadAiPlans,
		previewSubscriptionPurchase,
		previewTopup,
		createYooKassaPayment,
		confirmYooKassaPayment,
		purchasePlan,
		finalizeOAuthCallbackFromLocation,
		syncProfileFromServer,
		refreshBillingState,
		logout,
	}
})
