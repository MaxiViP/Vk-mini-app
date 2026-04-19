import type { OAuthProvider } from '../services/auth'

export type OAuthCallbackLocation = {
	provider: OAuthProvider
	code: string
	state: string
	key: string
}

const OAUTH_CALLBACK_PATH_RE = /^\/oauth\/(vk|google|yandex)\/callback$/

export const readOAuthCallbackFromLocation = (
	currentLocation: Location = window.location,
): OAuthCallbackLocation | null => {
	const callbackMatch = currentLocation.pathname.match(OAUTH_CALLBACK_PATH_RE)
	if (!callbackMatch) return null

	const provider = callbackMatch[1] as OAuthProvider
	const params = new URLSearchParams(currentLocation.search)
	const code = params.get('code')
	const state = params.get('state')

	if (!code || !state) return null

	return {
		provider,
		code,
		state,
		key: `${provider}:${state}:${code}`,
	}
}

export const clearOAuthCallbackFromLocation = (
	browserHistory: History = window.history,
	title: string = document.title,
) => {
	browserHistory.replaceState({}, title, '/')
}
