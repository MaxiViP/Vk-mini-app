import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios'

import { internalApiBaseUrl } from '../config/chatBackend'

const API_BASE_URL = internalApiBaseUrl || ''

export const backendStorageScope = String(internalApiBaseUrl || 'same-origin')
	.trim()
	.toLowerCase()
	.replace(/[^a-z0-9]+/g, '_')
export const TOKEN_STORAGE_KEY = `token:${backendStorageScope}`
export const REFRESH_TOKEN_STORAGE_KEY = `refresh_token:${backendStorageScope}`
export const USER_STORAGE_KEY = `user_profile:${backendStorageScope}`
export const BILLING_STORAGE_KEY = `billing_summary:${backendStorageScope}`

export const isDevSessionRefreshToken = (token?: string | null) => Boolean(token?.startsWith('dev-refresh-'))

type AuthResult = {
	accessToken: string
	refreshToken: string
}

const buildAuthHeaders = (accessToken?: string | null, headers?: HeadersInit) => {
	const normalizedHeaders = new Headers(headers || {})
	if (accessToken) {
		normalizedHeaders.set('Authorization', `Bearer ${accessToken}`)
	}
	return normalizedHeaders
}

const getStoredAccessToken = () => localStorage.getItem(TOKEN_STORAGE_KEY)
const getStoredRefreshToken = () => localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)

const dispatchSessionUpdated = () => {
	window.dispatchEvent(new CustomEvent('auth-session-updated'))
}

const dispatchSessionCleared = () => {
	window.dispatchEvent(new CustomEvent('auth-session-cleared'))
}

const persistTokens = ({ accessToken, refreshToken }: AuthResult) => {
	localStorage.setItem(TOKEN_STORAGE_KEY, accessToken)
	localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, refreshToken)
	dispatchSessionUpdated()
}

const clearStoredSession = () => {
	localStorage.removeItem(TOKEN_STORAGE_KEY)
	localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY)
	localStorage.removeItem(USER_STORAGE_KEY)
	localStorage.removeItem(BILLING_STORAGE_KEY)
	dispatchSessionCleared()
}

let refreshPromise: Promise<string> | null = null

const refreshAccessToken = async () => {
	if (refreshPromise) {
		return refreshPromise
	}

	const refreshToken = getStoredRefreshToken()
	if (!refreshToken || isDevSessionRefreshToken(refreshToken)) {
		throw new Error('No refresh token available')
	}

	refreshPromise = axios
		.post<AuthResult>(`${API_BASE_URL}/api/auth/refresh`, {
			refreshToken,
		})
		.then(response => {
			persistTokens(response.data)
			return response.data.accessToken
		})
		.catch(error => {
			const status = (error as { response?: { status?: number } })?.response?.status || null
			if (status === 401) {
				clearStoredSession()
			}
			throw error
		})
		.finally(() => {
			refreshPromise = null
		})

	return refreshPromise
}

export async function authorizedFetch(
	input: string,
	init: RequestInit = {},
	options: {
		accessToken?: string | null
		retryOn401?: boolean
	} = {},
) {
	const { accessToken = getStoredAccessToken(), retryOn401 = true } = options
	const response = await fetch(input, {
		...init,
		headers: buildAuthHeaders(accessToken, init.headers),
	})

	if (response.status !== 401 || !retryOn401) {
		return response
	}

	const refreshToken = getStoredRefreshToken()
	if (!refreshToken || isDevSessionRefreshToken(refreshToken)) {
		return response
	}

	const nextAccessToken = await refreshAccessToken()
	return fetch(input, {
		...init,
		headers: buildAuthHeaders(nextAccessToken, init.headers),
	})
}

export async function authorizedAxiosRequest<TResponse = unknown>(
	config: AxiosRequestConfig,
	options: {
		accessToken?: string | null
		retryOn401?: boolean
	} = {},
) {
	const { accessToken = getStoredAccessToken(), retryOn401 = true } = options
	const headers = {
		...(config.headers || {}),
		...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
	}

	try {
		return await axios.request<TResponse>({
			...config,
			headers,
		})
	} catch (error) {
		const status = (error as { response?: { status?: number } })?.response?.status || null
		const refreshToken = getStoredRefreshToken()
		if (status !== 401 || !retryOn401 || !refreshToken || isDevSessionRefreshToken(refreshToken)) {
			throw error
		}

		const nextAccessToken = await refreshAccessToken()
		return axios.request<TResponse>({
			...config,
			headers: {
				...(config.headers || {}),
				Authorization: `Bearer ${nextAccessToken}`,
			},
		})
	}
}

export const unwrapAxiosData = <TResponse>(promise: Promise<AxiosResponse<TResponse>>) => promise.then(response => response.data)
