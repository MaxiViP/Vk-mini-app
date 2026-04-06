import rateLimit from 'express-rate-limit'

export const apiRateLimit = rateLimit({
	windowMs: 60 * 1000,
	max: 120,
	standardHeaders: true,
	legacyHeaders: false,
	message: 'Too many requests, please try again in a minute.',
})
