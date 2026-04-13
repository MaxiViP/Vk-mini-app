import { AppError } from './errors.js'

export const requireFields = (payload, fields = []) => {
	const missing = fields.filter(
		field => payload[field] === undefined || payload[field] === null || payload[field] === '',
	)
	if (missing.length) {
		throw new AppError(`Missing required fields: ${missing.join(', ')}`, 400)
	}
}
