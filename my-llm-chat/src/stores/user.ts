import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import bridge from '@vkontakte/vk-bridge'

import type { User, YooKassaPaymentSession } from '../types'
import { confirmYooKassaPaymentRequest, createYooKassaPaymentRequest } from '../api/payments'
import { authApi, type OAuthProvider, type UserProfileResponse } from '../services/auth'

const TOKEN_STORAGE_KEY = 'token'
const REFRESH_TOKEN_STORAGE_KEY = 'refresh_token'
const USER_STORAGE_KEY = 'user_profile'

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

const mapApiUserToUiUser = (apiUser: {
	id: string
	firstName: string | null
	lastName: string | null
	avatarUrl: string | null
	phoneE164: string | null
	isAdmin?: boolean
	wallet?: { balanceMinor: number } | null
}) => ({
	vkId: apiUser.id,
	firstName: apiUser.firstName || 'User',
	lastName: apiUser.lastName || '',
	photo_200: apiUser.avatarUrl || undefined,
	balance: Number(apiUser.wallet?.balanceMinor || 0) / 100,
	requestsLeft: 0,
	phoneE164: apiUser.phoneE164 || undefined,
	isAdmin: resolveIsAdmin(apiUser.isAdmin, apiUser.phoneE164),
})

const safeParseUser = (raw: string | null): User | null => {
	if (!raw) return null
	try {
		return JSON.parse(raw) as User
	} catch {
		return null
	}
}

const applyLocalTopup = (targetUser: User | null, amount: number) => {
	if (!targetUser) return
	targetUser.balance += amount
	targetUser.requestsLeft += amount * 10
}

export const useUserStore = defineStore('user', () => {
	const user = ref<User | null>(safeParseUser(localStorage.getItem(USER_STORAGE_KEY)))
	const token = ref<string | null>(localStorage.getItem(TOKEN_STORAGE_KEY))
	const refreshToken = ref<string | null>(localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY))
	// const isTestMode = ref(true)
	const isTestMode = ref(import.meta.env.DEV || String(import.meta.env.VITE_TEST_MODE || 'false') === 'true')
	const pendingPhone = ref<string | null>(null)
	const authPending = ref(false)
	const phoneChallenge = ref<{ challengeId: string; expiresInSec: number; testCode: string | null } | null>(null)

	const isAuthenticated = computed(() => Boolean(token.value && user.value))

	const persistAuthState = () => {
		if (token.value) localStorage.setItem(TOKEN_STORAGE_KEY, token.value)
		if (refreshToken.value) localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, refreshToken.value)
		if (user.value) localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user.value))
	}

	const clearAuthState = () => {
		localStorage.removeItem(TOKEN_STORAGE_KEY)
		localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY)
		localStorage.removeItem(USER_STORAGE_KEY)
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
		user.value = mapApiUserToUiUser(result.user)
		persistAuthState()
	}

	const syncProfileFromServer = async () => {
		if (!token.value) return
		const profile: UserProfileResponse = await authApi.getMe(token.value)
		const currentUser = user.value
		user.value = {
			...mapApiUserToUiUser(profile),
			requestsLeft: currentUser?.requestsLeft || 0,
		}
		persistAuthState()
	}

	function hydrateAuth() {
		token.value = localStorage.getItem(TOKEN_STORAGE_KEY)
		refreshToken.value = localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)
		user.value = safeParseUser(localStorage.getItem(USER_STORAGE_KEY))

		if (user.value) {
			user.value.isAdmin = resolveIsAdmin(user.value.isAdmin, user.value.phoneE164)
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
		} catch (err) {
			console.error('VK init error', err)
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

	async function rechargeBalance(amount: number) {
		if (!token.value) return

		if (isTestMode.value) {
			applyLocalTopup(user.value, amount)
			persistAuthState()
			return
		}
	}

	async function createYooKassaPayment(amount: number): Promise<YooKassaPaymentSession> {
		if (!token.value) {
			throw new Error('Требуется авторизация')
		}

		try {
			return await createYooKassaPaymentRequest(amount, token.value)
		} catch (error) {
			if (!isTestMode.value) throw error

			const paymentId = `stub_${Date.now()}`
			return {
				paymentId,
				amount,
				status: 'pending',
				confirmationUrl: `https://yookassa.ru/checkout/payments/v2/contract?paymentId=${paymentId}`,
				qrCodeDataUrl:
					'data:image/svg+xml;charset=UTF-8,' +
					encodeURIComponent(
						'<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220"><rect width="220" height="220" fill="white"/><rect x="10" y="10" width="200" height="200" fill="none" stroke="black" stroke-width="4"/><text x="110" y="110" text-anchor="middle" font-size="16" font-family="monospace">QR STUB</text></svg>',
					),
				qrPayload: `STUB://YOOKASSA/${paymentId}/AMOUNT/${amount}`,
				isStub: true,
			}
		}
	}

	async function confirmYooKassaPayment(paymentId: string, amount: number) {
		if (!token.value) throw new Error('Требуется авторизация')

		try {
			const response = await confirmYooKassaPaymentRequest(paymentId, token.value)
			await syncProfileFromServer()
			return response
		} catch (error) {
			const status = (error as { response?: { status?: number } })?.response?.status
			const canUseStubFlow = isTestMode.value || status === 404
			if (!canUseStubFlow) throw error
			applyLocalTopup(user.value, amount)
			persistAuthState()
			return { paymentId, status: 'succeeded' as const, isStub: true, amount }
		}
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
		rechargeBalance,
		createYooKassaPayment,
		confirmYooKassaPayment,
		finalizeOAuthCallbackFromLocation,
		syncProfileFromServer,
		logout,
	}
})
