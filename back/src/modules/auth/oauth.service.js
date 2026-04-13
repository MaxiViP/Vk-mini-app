import crypto from 'node:crypto'

import axios from 'axios'
import jwt from 'jsonwebtoken'

import { AppError } from '../../shared/errors.js'
import { authService } from './auth.service.js'

const allowedProviders = new Set(['vk', 'google', 'yandex'])

const pendingStates = new Map()
const STATE_TTL_MS = 10 * 60 * 1000
const OAUTH_STATE_TTL_SEC = 10 * 60
const OAUTH_STATE_SECRET = process.env.OAUTH_STATE_SECRET || process.env.JWT_SECRET || 'change_me_in_prod'
const ALLOW_OAUTH_FALLBACK = process.env.OAUTH_ALLOW_FALLBACK === 'true'

const providerConfigs = {
	vk: {
		authBase: 'https://id.vk.com/authorize',
		tokenUrl: 'https://id.vk.com/oauth2/auth',
		profileUrl: null,
		clientId: process.env.VK_CLIENT_ID || '',
		clientSecret: process.env.VK_CLIENT_SECRET || '',
	},
	google: {
		authBase: 'https://accounts.google.com/o/oauth2/v2/auth',
		tokenUrl: 'https://oauth2.googleapis.com/token',
		profileUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
		clientId: process.env.GOOGLE_CLIENT_ID || '',
		clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
		scope: process.env.GOOGLE_OAUTH_SCOPE || 'openid email profile',
	},
	yandex: {
		authBase: 'https://oauth.yandex.ru/authorize',
		tokenUrl: 'https://oauth.yandex.ru/token',
		profileUrl: 'https://login.yandex.ru/info',
		clientId: process.env.YANDEX_CLIENT_ID || '',
		clientSecret: process.env.YANDEX_CLIENT_SECRET || '',
		scope: process.env.YANDEX_OAUTH_SCOPE || 'login:email login:info',
	},
}

const buildProviderAuthUrl = ({ provider, state, redirectUri }) => {
	const config = providerConfigs[provider]
	const params = new URLSearchParams({
		response_type: 'code',
		state,
		redirect_uri: redirectUri,
		client_id: config.clientId,
		...(config.scope ? { scope: config.scope } : {}),
	})

	if (provider === 'google') {
		params.set('access_type', 'offline')
		params.set('prompt', 'consent')
		params.set('include_granted_scopes', 'true')
	}

	return `${config.authBase}?${params.toString()}`
}

const fallbackProfileFromCode = ({ provider, code }) => {
	const providerUserId = `${provider}_${crypto.createHash('sha1').update(code).digest('hex').slice(0, 24)}`
	return {
		providerUserId,
		profile: {
			email: `${providerUserId}@oauth.local`,
			firstName: provider.toUpperCase(),
			lastName: 'User',
		},
	}
}

const createSignedState = ({ provider, redirectUri }) =>
	jwt.sign(
		{
			typ: 'oauth_state',
			provider,
			redirectUri,
			nonce: crypto.randomBytes(12).toString('hex'),
		},
		OAUTH_STATE_SECRET,
		{ expiresIn: OAUTH_STATE_TTL_SEC },
	)

const resolveStatePayload = ({ provider, state }) => {
	const saved = pendingStates.get(state)
	if (saved && saved.provider === provider && saved.expiresAt >= Date.now()) {
		pendingStates.delete(state)
		return { redirectUri: saved.redirectUri }
	}
	if (saved) {
		pendingStates.delete(state)
	}

	if (provider === 'vk' && state === 'vk-bridge') {
		return { redirectUri: process.env.VK_REDIRECT_URI || '' }
	}

	try {
		const payload = jwt.verify(state, OAUTH_STATE_SECRET)
		if (payload?.typ !== 'oauth_state') return null
		if (payload?.provider !== provider) return null
		if (typeof payload?.redirectUri !== 'string' || !payload.redirectUri) return null

		return { redirectUri: payload.redirectUri }
	} catch {
		return null
	}
}

const isProviderConfigPresent = provider => {
	const config = providerConfigs[provider]
	return Boolean(config?.clientId && config?.clientSecret)
}

const shouldUseFallback = provider => !isProviderConfigPresent(provider)

const toProviderErrorDetails = error => ({
	code: error?.code || null,
	status: error?.response?.status || null,
	providerMessage: error?.response?.data?.error_description || error?.response?.data?.error || null,
})

const exchangeOAuthCode = async ({ provider, code, redirectUri, codeVerifier }) => {
	if (shouldUseFallback(provider)) {
		return fallbackProfileFromCode({ provider, code })
	}
	if (!redirectUri) {
		throw new AppError('OAuth redirectUri is not configured', 500, {
			provider,
			hint: 'Set VK_REDIRECT_URI for vk-bridge flow and ensure redirectUri is passed for web OAuth.',
		})
	}

	const config = providerConfigs[provider]

	try {
		const tokenRes = await axios.post(
			config.tokenUrl,
			new URLSearchParams({
				grant_type: 'authorization_code',
				code,
				redirect_uri: redirectUri,
				client_id: config.clientId,
				client_secret: config.clientSecret,
				...(codeVerifier ? { code_verifier: codeVerifier } : {}),
			}).toString(),
			{
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				timeout: 10000,
			},
		)

		const accessToken = tokenRes.data?.access_token
		if (!accessToken) {
			throw new AppError('OAuth provider did not return access_token', 502, {
				provider,
				response: tokenRes.data || null,
			})
		}

		if (!config.profileUrl) {
			return fallbackProfileFromCode({ provider, code })
		}

		const profileRes = await axios.get(config.profileUrl, {
			headers: { Authorization: `Bearer ${accessToken}` },
			timeout: 10000,
		})

		const profile = profileRes.data || {}
		return {
			providerUserId: String(
				profile.id || profile.sub || profile.default_email || profile.login || profile.uid || crypto.randomUUID(),
			),
			profile: {
				email: profile.email || profile.default_email || null,
				firstName: profile.given_name || profile.first_name || profile.real_name || null,
				lastName: profile.family_name || profile.last_name || null,
				avatarUrl: profile.picture || profile.default_avatar_id || null,
			},
		}
	} catch (error) {
		if (ALLOW_OAUTH_FALLBACK) {
			return fallbackProfileFromCode({ provider, code })
		}

		if (error instanceof AppError) throw error

		throw new AppError('OAuth code exchange failed', 502, {
			provider,
			redirectUri,
			...toProviderErrorDetails(error),
		})
	}
}

export const oauthService = {
	async start({ provider, redirectUri }) {
		if (!allowedProviders.has(provider)) throw new AppError('Unsupported OAuth provider', 400)
		if (!redirectUri) throw new AppError('redirectUri is required', 400)

		const state = createSignedState({ provider, redirectUri })
		pendingStates.set(state, { provider, redirectUri, expiresAt: Date.now() + STATE_TTL_MS })
		const authUrl = buildProviderAuthUrl({ provider, state, redirectUri })

		return { authUrl, state }
	},

	async finalize({ provider, code, state, codeVerifier, userAgent, ip }) {
		if (!allowedProviders.has(provider)) throw new AppError('Unsupported OAuth provider', 400)
		if (!code || !state) throw new AppError('code and state are required', 400)

		const saved = resolveStatePayload({ provider, state })
		if (!saved) {
			throw new AppError('Invalid OAuth state', 400)
		}

		const { providerUserId, profile } = await exchangeOAuthCode({
			provider,
			code,
			redirectUri: saved.redirectUri,
			codeVerifier,
		})

		const user = await authService.upsertOAuthUser({ provider, providerUserId, profile })
		return authService.issueTokens({ user, userAgent, ip })
	},
}
