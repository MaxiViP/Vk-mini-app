import rateLimit from 'express-rate-limit'
import env from '../config/env.js'

const isDevMode = env.nodeEnv !== 'production'

export const apiRateLimitMax = isDevMode ? 300 : 120

export const isWebhookPath = path =>
	path === '/api/billing/yookassa/webhook' || path === '/api/payments/yookassa/webhook'

export const shouldSkipRateLimit = req => {
	if (isWebhookPath(req.path)) return true
	if (!isDevMode) return false

	return req.path === '/api/users/me/activity' || req.path.startsWith('/api/admin/')
}

export const apiRateLimit = rateLimit({
	windowMs: 60 * 1000,
	max: apiRateLimitMax,
	standardHeaders: true,
	legacyHeaders: false,
	message: 'Too many requests, please try again in a minute.',
	skip: shouldSkipRateLimit,
})
