import { Router } from 'express'

import { authMiddleware } from '../auth/auth.middleware.js'
import { adminService } from './admin.service.js'
import { AppError } from '../../shared/errors.js'
import logger from '../../config/logger.js'

const router = Router()

const requireAdmin = (req, _res, next) => {
	if (req.user?.id === 'dev-admin' || req.header('x-admin-secret') === process.env.ADMIN_MONITOR_SECRET) {
		return next()
	}
	return next(new AppError('Admin access required', 403))
}

router.use(authMiddleware, requireAdmin)

router.get('/events', async (req, res, next) => {
	try {
		const data = await adminService.getBusinessEvents({
			limit: Number(req.query.limit || 100),
			cursor: req.query.cursor || null,
			eventType: req.query.eventType || null,
			dateFrom: req.query.dateFrom || null,
			dateTo: req.query.dateTo || null,
		})
		res.json(data)
	} catch (error) {
		next(error)
	}
})

router.get('/ledger', async (req, res, next) => {
	try {
		const data = await adminService.getLedger({
			userId: req.query.userId || null,
			limit: Number(req.query.limit || 100),
			cursor: req.query.cursor || null,
			dateFrom: req.query.dateFrom || null,
			dateTo: req.query.dateTo || null,
		})
		res.json(data)
	} catch (error) {
		next(error)
	}
})

router.get('/audit', async (req, res, next) => {
	try {
		const data = await adminService.getAuditLog({
			userId: req.query.userId || null,
			limit: Number(req.query.limit || 100),
			cursor: req.query.cursor || null,
			dateFrom: req.query.dateFrom || null,
			dateTo: req.query.dateTo || null,
		})
		res.json(data)
	} catch (error) {
		next(error)
	}
})

router.get('/metrics', async (_req, res, next) => {
	try {
		const data = await adminService.getMetrics()
		res.json(data)
	} catch (error) {
		next(error)
	}
})

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

router.get('/users/:id/actions', async (req, res, next) => {
	try {
		const data = await adminService.getUserActions(req.params.id, {
			limit: Number(req.query.limit || 200),
			dateFrom: req.query.dateFrom || null,
			dateTo: req.query.dateTo || null,
		})
		res.json(data)
	} catch (error) {
		next(error)
	}
})

router.get('/users/:id/timeline', async (req, res, next) => {
	try {
		const data = await adminService.getUserTimeline({
			userId: req.params.id,
			limit: Number(req.query.limit || 100),
			dateFrom: req.query.dateFrom || null,
			dateTo: req.query.dateTo || null,
		})
		res.json(data)
	} catch (error) {
		next(error)
	}
})

export default router
