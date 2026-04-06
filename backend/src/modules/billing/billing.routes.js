import { Router } from 'express'

import { billingService } from './billing.service.js'
import { authMiddleware } from '../auth/auth.middleware.js'
import { requireFields } from '../../shared/validate.js'

const router = Router()

router.post('/yookassa/create', authMiddleware, async (req, res, next) => {
	try {
		requireFields(req.body, ['amount'])
		const result = await billingService.createYooKassaPayment({
			userId: req.user.id,
			amount: req.body.amount,
			returnUrl: req.body.returnUrl,
			idempotencyKey: req.body.idempotencyKey || req.header('Idempotency-Key') || undefined,
		})
		res.status(201).json(result)
	} catch (error) {
		next(error)
	}
})

router.post('/yookassa/webhook', async (req, res, next) => {
	try {
		const result = await billingService.handleYooKassaWebhook(req.body)
		res.json(result)
	} catch (error) {
		next(error)
	}
})

router.get('/history', authMiddleware, async (req, res, next) => {
	try {
		const result = await billingService.getHistory({
			userId: req.user.id,
			limit: Number(req.query.limit || 50),
		})
		res.json(result)
	} catch (error) {
		next(error)
	}
})

router.get('/:id', authMiddleware, async (req, res, next) => {
	try {
		const result = await billingService.getPaymentById(req.params.id)
		res.json(result)
	} catch (error) {
		next(error)
	}
})

export default router
