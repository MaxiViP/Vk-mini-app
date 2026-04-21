import env from '../config/env.js'
import logger from '../config/logger.js'

export class AppError extends Error {
	constructor(message, statusCode = 500, details = null) {
		super(message)
		this.name = 'AppError'
		this.statusCode = statusCode
		this.details = details
	}
}

const isDatabaseUnavailableError = error => {
	const message = String(error?.message || '')
	return (
		message.includes('Can\'t reach database server') ||
		message.includes('Cant reach database server') ||
		message.includes('Connection refused') ||
		message.includes('ECONNREFUSED')
	)
}

const normalizeError = error => {
	if (error instanceof AppError) return error

	if (isDatabaseUnavailableError(error)) {
		return new AppError('Database is unavailable', 503, {
			code: 'DATABASE_UNAVAILABLE',
			hint: 'Configure DATABASE_URL for a reachable database or run a local MySQL instance.',
		})
	}

	return error
}

export const notFoundHandler = (req, _res, next) => {
	next(new AppError(`Route ${req.method} ${req.originalUrl} not found`, 404))
}

export const errorHandler = (error, req, res, _next) => {
	const normalizedError = normalizeError(error)
	const statusCode = normalizedError.statusCode || 500
	const logPayload = {
		method: req.method,
		url: req.originalUrl,
		statusCode,
		message: normalizedError.message || 'Internal server error',
		details: normalizedError.details || null,
		...(env.nodeEnv !== 'production' && normalizedError.stack ? { stack: normalizedError.stack } : {}),
	}

	if (statusCode >= 500) {
		logger.error('Request failed', logPayload)
	} else {
		logger.warn('Request failed', logPayload)
	}

	res.status(statusCode).json({
		message: normalizedError.message || 'Internal server error',
		details: normalizedError.details || null,
	})
}
