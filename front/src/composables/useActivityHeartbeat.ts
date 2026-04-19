import { internalApiBaseUrl } from '../config/chatBackend'

const ACTIVITY_INTERVAL_SEC = 30

const isLikelyJwt = (token?: string | null) => Boolean(token && token.split('.').length === 3)

export const useActivityHeartbeat = (authState: { token: string | null }) => {
	const sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
	let activityTimer: number | null = null

	const sendActivityHeartbeat = async () => {
		if (!authState.token || !isLikelyJwt(authState.token) || document.hidden) return

		try {
			await fetch(`${internalApiBaseUrl}/api/users/me/activity`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${authState.token}`,
				},
				body: JSON.stringify({
					sessionId,
					activeSeconds: ACTIVITY_INTERVAL_SEC,
					page: window.location.pathname,
					requestsCount: 0,
					notesMutations: 0,
					chatMessagesSent: 0,
				}),
			})
		} catch (error) {
			console.warn('Activity heartbeat failed', error)
		}
	}

	const startActivityTracking = () => {
		if (activityTimer) window.clearInterval(activityTimer)
		activityTimer = window.setInterval(() => {
			void sendActivityHeartbeat()
		}, ACTIVITY_INTERVAL_SEC * 1000)
	}

	const stopActivityTracking = () => {
		if (!activityTimer) return
		window.clearInterval(activityTimer)
		activityTimer = null
	}

	return {
		sendActivityHeartbeat,
		startActivityTracking,
		stopActivityTracking,
	}
}
