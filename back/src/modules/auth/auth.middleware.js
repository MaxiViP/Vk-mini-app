import jwt from 'jsonwebtoken'

import env from '../../config/env.js'
import logger from '../../config/logger.js'
import { AppError } from '../../shared/errors.js'

export const authMiddleware = (req, _res, next) => {
	const header = req.header('Authorization')
	if (!header?.startsWith('Bearer ')) {
		logger.warn('Auth failed: missing bearer token', {
			path: req.originalUrl,
			method: req.method,
			hasAuthHeader: Boolean(header),
		})
		return next(new AppError('Unauthorized', 401))
	}

	const token = header.slice('Bearer '.length)

	try {
		const payload = jwt.verify(token, env.jwtSecret)
		req.user = {
			id: payload.sub,
			status: payload.status,
			phoneE164: payload.phoneE164 || null,
			firstName: payload.firstName || null,
			lastName: payload.lastName || null,
			avatarUrl: payload.avatarUrl || null,
			isAdmin: Boolean(payload.isAdmin),
		}
		next()
	} catch (error) {
		logger.warn('Auth failed: invalid token', {
			path: req.originalUrl,
			method: req.method,
			error: error.message,
			tokenPreview: token.slice(0, 12),
			tokenParts: token.split('.').length,
		})
		next(new AppError('Invalid token', 401))
	}
}
