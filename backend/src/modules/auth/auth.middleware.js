import jwt from 'jsonwebtoken'

import env from '../../config/env.js'
import { AppError } from '../../shared/errors.js'

export const authMiddleware = (req, _res, next) => {
	const header = req.header('Authorization')
	if (!header?.startsWith('Bearer ')) {
		return next(new AppError('Unauthorized', 401))
	}

	const token = header.slice('Bearer '.length)
	try {
		const payload = jwt.verify(token, env.jwtSecret)
		req.user = {
			id: payload.sub,
			status: payload.status,
		}
		next()
	} catch {
		next(new AppError('Invalid token', 401))
	}
}
