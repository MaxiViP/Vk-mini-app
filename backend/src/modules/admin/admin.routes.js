import { Router } from 'express'

import { authMiddleware } from '../auth/auth.middleware.js'
import { adminService } from './admin.service.js'
import logger from '../../config/logger.js'
import { requireAdmin } from '../../shared/access.js'
import { asyncHandler } from '../../shared/async-handler.js'

const router = Router()

router.use(authMiddleware, requireAdmin)

router.get(
	'/events',
	asyncHandler(async (req, res) => {
		const data = await adminService.getBusinessEvents({
			limit: Number(req.query.limit || 100),
			cursor: req.query.cursor || null,
			eventType: req.query.eventType || null,
			dateFrom: req.query.dateFrom || null,
			dateTo: req.query.dateTo || null,
		})
		res.json(data)
	}),
)

router.get(
	'/ledger',
	asyncHandler(async (req, res) => {
		const data = await adminService.getLedger({
			userId: req.query.userId || null,
			limit: Number(req.query.limit || 100),
			cursor: req.query.cursor || null,
			dateFrom: req.query.dateFrom || null,
			dateTo: req.query.dateTo || null,
		})
		res.json(data)
	}),
)

router.get(
	'/audit',
	asyncHandler(async (req, res) => {
		const data = await adminService.getAuditLog({
			userId: req.query.userId || null,
			limit: Number(req.query.limit || 100),
			cursor: req.query.cursor || null,
			dateFrom: req.query.dateFrom || null,
			dateTo: req.query.dateTo || null,
		})
		res.json(data)
	}),
)

router.get(
	'/metrics',
	asyncHandler(async (_req, res) => {
		const data = await adminService.getMetrics()
		res.json(data)
	}),
)

router.get('/users', async (req, res, next) => {
	const limit = Number(req.query.limit || 100)
	const query = req.query.query || null
	logger.info('Admin users request started', {
		adminUserId: req.user?.id || null,
		limit,
		query,
	})

	try {
		const data = await adminService.listUsersOverview({
			limit,
			query,
		})
		logger.info('Admin users request succeeded', {
			adminUserId: req.user?.id || null,
			limit,
			query,
			count: data.length,
		})
		res.json(data)
	} catch (error) {
		logger.error('Admin users request failed', {
			adminUserId: req.user?.id || null,
			limit,
			query,
			error: error.message,
		})
		next(error)
	}
})

router.get(
	'/users/:id/actions',
	asyncHandler(async (req, res) => {
		const data = await adminService.getUserActions(req.params.id, {
			limit: Number(req.query.limit || 200),
			dateFrom: req.query.dateFrom || null,
			dateTo: req.query.dateTo || null,
		})
		res.json(data)
	}),
)

router.get(
	'/users/:id/timeline',
	asyncHandler(async (req, res) => {
		const data = await adminService.getUserTimeline({
			userId: req.params.id,
			limit: Number(req.query.limit || 100),
			dateFrom: req.query.dateFrom || null,
			dateTo: req.query.dateTo || null,
		})
		res.json(data)
	}),
)

export default router
