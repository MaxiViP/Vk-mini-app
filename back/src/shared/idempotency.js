const TTL_MS = 60_000
const cache = new Map()

const cleanupExpiredEntries = now => {
	for (const [key, entry] of cache.entries()) {
		if (now - entry.createdAt >= TTL_MS) {
			cache.delete(key)
		}
	}
}

const buildCacheKey = req => {
	const idempotencyKey = String(req.header('Idempotency-Key') || '').trim()
	const routeKey = String(req.originalUrl || '')
	const userKey = String(req.user?.id || 'anonymous')
	return `${idempotencyKey}:${routeKey}:${userKey}`
}

export const idempotencyMiddleware = (req, res, next) => {
	const idempotencyKey = String(req.header('Idempotency-Key') || '').trim()
	if (!idempotencyKey) return next()

	const now = Date.now()
	cleanupExpiredEntries(now)

	const cacheKey = buildCacheKey(req)
	const cachedEntry = cache.get(cacheKey)

	if (cachedEntry) {
		return res.status(409).json({
			message: 'Duplicate request detected',
			cachedAt: new Date(cachedEntry.createdAt).toISOString(),
		})
	}

	cache.set(cacheKey, { createdAt: now })

	const clearCacheKey = () => {
		cache.delete(cacheKey)
	}

	res.on('finish', () => {
		if (res.statusCode >= 400) {
			clearCacheKey()
		}
	})

	res.on('close', () => {
		if (!res.writableEnded || res.statusCode >= 400) {
			clearCacheKey()
		}
	})

	next()
}
