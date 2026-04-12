import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import bridge from '@vkontakte/vk-bridge'

import type { BillingSummary, User, YooKassaPaymentSession } from '../types'
import { billingApi } from '../api/billing'
import { confirmYooKassaPaymentRequest, createYooKassaPaymentRequest } from '../api/payments'
import { authApi, type OAuthProvider, type UserProfileResponse } from '../services/auth'

const TOKEN_STORAGE_KEY = 'token'
const REFRESH_TOKEN_STORAGE_KEY = 'refresh_token'
const USER_STORAGE_KEY = 'user_profile'
const BILLING_STORAGE_KEY = 'billing_summary'

const FORCED_ADMIN_PHONES = ['+79057353580']

const normalizePhone = (value?: string | null) => {
	const digits = String(value || '').replace(/\D/g, '')
	if (!digits) return ''

	let normalizedDigits = digits

	if (normalizedDigits.startsWith('8') && normalizedDigits.length === 11) {
		normalizedDigits = `7${normalizedDigits.slice(1)}`
	} else if (normalizedDigits.length === 10) {
		normalizedDigits = `7${normalizedDigits}`
	}

	return `+${normalizedDigits}`
}

const isForcedAdminPhone = (value?: string | null) => {
	const normalized = normalizePhone(value)
	if (!normalized) return false
	return FORCED_ADMIN_PHONES.some(phone => normalizePhone(phone) === normalized)
}

const resolveIsAdmin = (isAdmin: boolean | undefined, phoneE164?: string | null) =>
	Boolean(isAdmin) || isForcedAdminPhone(phoneE164)

const safeParse = <T>(raw: string | null): T | null => {
	if (!raw) return null
	try {
		return JSON.parse(raw) as T
	} catch {
		return null
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
	isAdmin: resolveIsAdmin(apiUser.isAdmin, apiUser.phoneE164),
})

export const useUserStore = defineStore('user', () => {
	const user = ref<User | null>(safeParse<User>(localStorage.getItem(USER_STORAGE_KEY)))
	const billing = ref<BillingSummary | null>(safeParse<BillingSummary>(localStorage.getItem(BILLING_STORAGE_KEY)))
	const token = ref<string | null>(localStorage.getItem(TOKEN_STORAGE_KEY))
	const refreshToken = ref<string | null>(localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY))
	const isTestMode = ref(import.meta.env.DEV || String(import.meta.env.VITE_TEST_MODE || 'false') === 'true')
	const pendingPhone = ref<string | null>(null)
	const authPending = ref(false)
	const phoneChallenge = ref<{ challengeId: string; expiresInSec: number; testCode: string | null } | null>(null)

	const isAuthenticated = computed(() => Boolean(token.value && user.value))
	const activeSubscription = computed(() => billing.value?.activeSubscription || null)

	const persistAuthState = () => {
		if (token.value) localStorage.setItem(TOKEN_STORAGE_KEY, token.value)
		if (refreshToken.value) localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, refreshToken.value)
		if (user.value) localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user.value))
		if (billing.value) localStorage.setItem(BILLING_STORAGE_KEY, JSON.stringify(billing.value))
	}

	const clearAuthState = () => {
		localStorage.removeItem(TOKEN_STORAGE_KEY)
		localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY)
		localStorage.removeItem(USER_STORAGE_KEY)
		localStorage.removeItem(BILLING_STORAGE_KEY)
	}

	const applyBillingSummary = (summary: BillingSummary | null) => {
		billing.value = summary
		if (user.value && summary) {
			user.value.balance = summary.wallet.balance
			user.value.requestsLeft = summary.usageSnapshot.remainingIncludedRequests
		}
		persistAuthState()
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

		const [profile, summary]: [UserProfileResponse, BillingSummary] = await Promise.all([
			authApi.getMe(token.value),
			billingApi.getSummary(token.value),
		])

		billing.value = summary
		user.value = mapApiUserToUiUser(profile, summary)
		persistAuthState()

		return { profile, summary }
	}

	const refreshBillingState = async () => {
		if (!token.value) return null
		const summary = await billingApi.getSummary(token.value)
		applyBillingSummary(summary)
		return summary
	}

	function hydrateAuth() {
		token.value = localStorage.getItem(TOKEN_STORAGE_KEY)
		refreshToken.value = localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)
		user.value = safeParse<User>(localStorage.getItem(USER_STORAGE_KEY))
		billing.value = safeParse<BillingSummary>(localStorage.getItem(BILLING_STORAGE_KEY))

		if (user.value) {
			user.value.isAdmin = resolveIsAdmin(user.value.isAdmin, user.value.phoneE164)
			if (billing.value) {
				user.value.balance = billing.value.wallet.balance
				user.value.requestsLeft = billing.value.usageSnapshot.remainingIncludedRequests
			}
			persistAuthState()
			void syncProfileFromServer()
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
				await syncProfileFromServer()
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
			await syncProfileFromServer()
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
			await syncProfileFromServer()
			phoneChallenge.value = null
			return result
		} finally {
			authPending.value = false
		}
	}

	async function refreshAuth() {
		if (!refreshToken.value) throw new Error('Нет refresh token')
		const result = await authApi.refresh(refreshToken.value)
		applyAuthResult(result)
		await syncProfileFromServer()
		return result
	}

	async function createYooKassaPayment(amount: number): Promise<YooKassaPaymentSession> {
		if (!token.value) {
			throw new Error('Требуется авторизация')
		}

		return createYooKassaPaymentRequest(amount, token.value)
	}

	async function confirmYooKassaPayment(paymentId: string) {
		if (!token.value) throw new Error('Требуется авторизация')
		const response = await confirmYooKassaPaymentRequest(paymentId, token.value)
		await syncProfileFromServer()
		return response
	}

	async function purchasePlan(planCode: string) {
		if (!token.value) throw new Error('Требуется авторизация')
		const idempotencyKey = crypto.randomUUID()
		const response = await billingApi.purchaseSubscription(planCode, token.value, idempotencyKey)
		await syncProfileFromServer()
		return response
	}

	async function logout() {
		try {
			if (refreshToken.value) {
				await authApi.logout(refreshToken.value)
			}
		} catch (error) {
			console.warn('logout api failed:', error)
		} finally {
			user.value = null
			billing.value = null
			token.value = null
			refreshToken.value = null
			pendingPhone.value = null
			phoneChallenge.value = null
			clearAuthState()
		}
	}

	async function finalizeOAuthCallbackFromLocation() {
		const callbackMatch = window.location.pathname.match(/^\/oauth\/(vk|google|yandex)\/callback$/)
		if (!callbackMatch) return false

		const provider = callbackMatch[1] as OAuthProvider
		const params = new URLSearchParams(window.location.search)
		const code = params.get('code')
		const state = params.get('state')
		if (!code || !state) {
			throw new Error('OAuth callback не содержит code/state')
		}

		authPending.value = true
		try {
			const result = await authApi.finalizeOAuth({ provider, code, state })
			applyAuthResult(result)
			await syncProfileFromServer()
			window.history.replaceState({}, document.title, '/')
			return true
		} finally {
			authPending.value = false
		}
	}

	return {
		user,
		billing,
		activeSubscription,
		token,
		refreshToken,
		isTestMode,
		pendingPhone,
		authPending,
		phoneChallenge,
		isAuthenticated,
		hydrateAuth,
		initVKUser,
		loginByProvider,
		sendPhoneCode,
		loginByPhone,
		refreshAuth,
		createYooKassaPayment,
		confirmYooKassaPayment,
		purchasePlan,
		finalizeOAuthCallbackFromLocation,
		syncProfileFromServer,
		refreshBillingState,
		logout,
	}
})
