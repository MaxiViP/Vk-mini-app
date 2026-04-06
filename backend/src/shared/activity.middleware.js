import jwt from 'jsonwebtoken'

import env from '../config/env.js'
import { logBusinessEvent } from './observability.js'

const extractUserId = req => {
	const header = req.header('Authorization')
	if (!header?.startsWith('Bearer ')) return null

	const token = header.slice('Bearer '.length)
	try {
		const payload = jwt.verify(token, env.jwtSecret)
		return payload?.sub || null
	} catch {
		return null
	}
}

export const apiActivityMiddleware = (req, res, next) => {
	if (!req.path.startsWith('/api')) return next()
	if (req.path === '/health') return next()

	const startedAt = Date.now()
	const actorUserId = extractUserId(req)

	res.on('finish', () => {
		if (!actorUserId) return
		void logBusinessEvent({
			eventType: 'api.request',
			actorUserId,
			entityType: 'api',
			entityId: `${req.method} ${req.originalUrl}`,
			payload: {
				method: req.method,
				path: req.path,
				statusCode: res.statusCode,
				durationMs: Date.now() - startedAt,
			},
			ip: req.ip,
			userAgent: req.headers['user-agent'] || null,
		})
	})

	next()
}
