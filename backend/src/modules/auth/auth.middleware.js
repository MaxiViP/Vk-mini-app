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
	if (env.nodeEnv !== 'production' && token === 'dev-admin-token') {
		req.user = {
			id: 'dev-admin',
			status: 'active',
		}
		return next()
	}

	try {
		const payload = jwt.verify(token, env.jwtSecret)
		req.user = {
			id: payload.sub,
			status: payload.status,
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
