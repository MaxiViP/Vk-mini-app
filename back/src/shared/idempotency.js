const cache = new Map()

export const idempotencyMiddleware = (req, res, next) => {
	const key = req.header('Idempotency-Key')
	if (!key) return next()

	if (cache.has(key)) {
		return res.status(409).json({
			message: 'Duplicate request detected',
			cachedAt: cache.get(key),
		})
	}

	cache.set(key, new Date().toISOString())
	next()
}
