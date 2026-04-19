import { clearOAuthCallbackFromLocation, readOAuthCallbackFromLocation } from '../utils/oauthCallback'

const OAUTH_CALLBACK_HANDLED_KEY = 'oauth_callback_handled'

const readHandledOAuthCallbackKey = () => {
	try {
		return sessionStorage.getItem(OAUTH_CALLBACK_HANDLED_KEY)
	} catch {
		return null
	}
}

const writeHandledOAuthCallbackKey = (value: string) => {
	try {
		sessionStorage.setItem(OAUTH_CALLBACK_HANDLED_KEY, value)
	} catch {
		// ignore sessionStorage failures
	}
}

export const useOAuthCallback = (options: {
	finalizeOAuthCallbackFromLocation: () => Promise<boolean>
}) => {
	let oauthCallbackInFlightKey: string | null = null
	let oauthCallbackInFlightPromise: Promise<boolean> | null = null

	const finalizeOAuthCallback = async (oauthCallbackKey: string) => {
		oauthCallbackInFlightKey = oauthCallbackKey
		oauthCallbackInFlightPromise = options.finalizeOAuthCallbackFromLocation()

		try {
			const oauthCallbackHandled = await oauthCallbackInFlightPromise
			if (oauthCallbackHandled) {
				writeHandledOAuthCallbackKey(oauthCallbackKey)
				clearOAuthCallbackFromLocation()
			}

			return oauthCallbackHandled
		} finally {
			oauthCallbackInFlightKey = null
			oauthCallbackInFlightPromise = null
		}
	}

	const handleOAuthCallback = async () => {
		const oauthCallback = readOAuthCallbackFromLocation()
		if (!oauthCallback) return false

		try {
			if (readHandledOAuthCallbackKey() === oauthCallback.key) {
				clearOAuthCallbackFromLocation()
				return true
			}

			if (oauthCallbackInFlightKey === oauthCallback.key && oauthCallbackInFlightPromise) {
				return await oauthCallbackInFlightPromise
			}

			return await finalizeOAuthCallback(oauthCallback.key)
		} catch (error) {
			oauthCallbackInFlightKey = null
			oauthCallbackInFlightPromise = null
			console.error('OAuth callback finalize error', error)
			return false
		}
	}

	return {
		handleOAuthCallback,
	}
}
