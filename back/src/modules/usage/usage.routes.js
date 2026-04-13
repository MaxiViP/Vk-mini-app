import { Router } from 'express'

import { usageService } from './usage.service.js'
import { authMiddleware } from '../auth/auth.middleware.js'
import { requireFields } from '../../shared/validate.js'
import { asyncHandler } from '../../shared/async-handler.js'

const router = Router()

router.get(
	'/',
	authMiddleware,
	asyncHandler(async (req, res) => {
		const result = await usageService.getUsage(req.user.id)
		res.json(result)
	}),
)

router.post(
	'/charge',
	authMiddleware,
	asyncHandler(async (req, res) => {
		requireFields(req.body, ['modelProvider', 'modelName'])
		const result = await usageService.charge({
			userId: req.user.id,
			...req.body,
		})
		res.status(201).json(result)
	}),
)

export default router
