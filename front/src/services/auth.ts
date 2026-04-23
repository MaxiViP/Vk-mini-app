import axios from 'axios'
import { authorizedAxiosRequest, unwrapAxiosData } from './authSession'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

export type OAuthProvider = 'vk' | 'google' | 'yandex'

export interface OAuthStartResponse {
	state: string
	authUrl: string
}

export interface AuthResult {
	accessToken: string
	refreshToken: string
	refreshTokenExpiresAt: string
	user: {
		id: string
		email: string | null
		phoneE164: string | null
		firstName: string | null
		lastName: string | null
		avatarUrl: string | null
		status: 'active' | 'blocked' | 'deleted'
		isAdmin?: boolean
	}
}

export interface UserProfileResponse {
	id: string
	email: string | null
	phoneE164: string | null
	firstName: string | null
	lastName: string | null
	avatarUrl: string | null
	status: 'active' | 'blocked' | 'deleted'
	isAdmin?: boolean
	wallet?: {
		balanceMinor: number
		currency: string
	} | null
}

export const authApi = {
	startOAuth(provider: OAuthProvider, redirectUri: string) {
		return axios
			.post<OAuthStartResponse>(`${API_BASE_URL}/api/auth/oauth/${provider}/start`, { redirectUri })
			.then(response => response.data)
	},

	finalizeOAuth(payload: { provider: OAuthProvider; code: string; state: string; codeVerifier?: string }) {
		const { provider, ...body } = payload
		return axios
			.post<AuthResult>(`${API_BASE_URL}/api/auth/oauth/${provider}/finalize`, body)
			.then(response => response.data)
	},

	requestPhoneCode(phone: string) {
		return axios
			.post<{ challengeId: string; expiresInSec: number; debugCode?: string }>(
				`${API_BASE_URL}/api/auth/phone/request`,
				{
					phone,
				},
			)
			.then(response => response.data)
	},

	verifyPhoneCode(payload: { challengeId: string; code: string }) {
		return axios.post<AuthResult>(`${API_BASE_URL}/api/auth/phone/verify`, payload).then(response => response.data)
	},

	refresh(refreshToken: string) {
		return axios.post<AuthResult>(`${API_BASE_URL}/api/auth/refresh`, { refreshToken }).then(response => response.data)
	},

	logout(refreshToken: string) {
		return axios
			.post<{ success: boolean }>(`${API_BASE_URL}/api/auth/logout`, { refreshToken })
			.then(response => response.data)
	},

	getMe(accessToken: string) {
		return unwrapAxiosData(
			authorizedAxiosRequest<UserProfileResponse>(
				{
					method: 'GET',
					url: `${API_BASE_URL}/api/users/me`,
				},
				{ accessToken },
			),
		)
	},
}
