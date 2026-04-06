export class AppError extends Error {
	constructor(message, statusCode = 500, details = null) {
		super(message)
		this.name = 'AppError'
		this.statusCode = statusCode
		this.details = details
	}
}

export const notFoundHandler = (req, _res, next) => {
	next(new AppError(`Route ${req.method} ${req.originalUrl} not found`, 404))
}

export const errorHandler = (error, _req, res, _next) => {
	const statusCode = error.statusCode || 500
	res.status(statusCode).json({
		message: error.message || 'Internal server error',
		details: error.details || null,
	})
}
