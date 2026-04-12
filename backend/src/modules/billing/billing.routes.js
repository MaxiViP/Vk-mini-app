import { Router } from 'express'

import { billingService } from './billing.service.js'
import { authMiddleware } from '../auth/auth.middleware.js'
import { requireFields } from '../../shared/validate.js'
import { asyncHandler } from '../../shared/async-handler.js'

const router = Router()

router.get(
	'/summary',
	authMiddleware,
	asyncHandler(async (req, res) => {
		const result = await billingService.getSummary({
			userId: req.user.id,
			historyLimit: Number(req.query.historyLimit || 20),
		})
		res.json(result)
	}),
)

router.post(
	'/subscriptions/purchase',
	authMiddleware,
	asyncHandler(async (req, res) => {
		requireFields(req.body, ['planCode'])
		const result = await billingService.purchaseSubscription({
			userId: req.user.id,
			planCode: req.body.planCode,
			idempotencyKey: req.body.idempotencyKey || req.header('Idempotency-Key') || undefined,
		})
		res.status(201).json(result)
	}),
)

router.post(
	'/yookassa/create',
	authMiddleware,
	asyncHandler(async (req, res) => {
		requireFields(req.body, ['amount'])
		const result = await billingService.createYooKassaPayment({
			userId: req.user.id,
			amount: req.body.amount,
			returnUrl: req.body.returnUrl,
			idempotencyKey: req.body.idempotencyKey || req.header('Idempotency-Key') || undefined,
		})
		res.status(201).json(result)
	}),
)

router.post(
	'/yookassa/webhook',
	asyncHandler(async (req, res) => {
		const result = await billingService.handleYooKassaWebhook(req.body)
		res.json(result)
	}),
)

router.post(
	'/yookassa/confirm',
	authMiddleware,
	asyncHandler(async (req, res) => {
		requireFields(req.body, ['paymentId'])
		const result = await billingService.confirmYooKassaPayment({
			paymentId: req.body.paymentId,
			actorUserId: req.user.id,
		})
		res.json(result)
	}),
)

router.get(
	'/history',
	authMiddleware,
	asyncHandler(async (req, res) => {
		const result = await billingService.getHistory({
			userId: req.user.id,
			limit: Number(req.query.limit || 50),
		})
		res.json(result)
	}),
)

router.get(
	'/:id',
	authMiddleware,
	asyncHandler(async (req, res) => {
		const result = await billingService.getPaymentById({
			paymentId: req.params.id,
			actorUserId: req.user.id,
		})
		res.json(result)
	}),
)

export default router
