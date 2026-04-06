import { Router } from 'express'

import { usageService } from './usage.service.js'
import { authMiddleware } from '../auth/auth.middleware.js'
import { requireFields } from '../../shared/validate.js'

const router = Router()

router.get('/', authMiddleware, async (req, res, next) => {
	try {
		const result = await usageService.getUsage(req.user.id)
		res.json(result)
	} catch (error) {
		next(error)
	}
})

router.post('/charge', authMiddleware, async (req, res, next) => {
	try {
		requireFields(req.body, ['modelProvider', 'modelName'])
		const result = await usageService.charge({
			userId: req.user.id,
			...req.body,
		})
		res.status(201).json(result)
	} catch (error) {
		next(error)
	}
})

export default router
