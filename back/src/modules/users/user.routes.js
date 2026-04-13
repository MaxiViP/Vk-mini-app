import { Router } from 'express'

import { userService } from './user.service.js'
import { authMiddleware } from '../auth/auth.middleware.js'
import { requireAdmin } from '../../shared/access.js'
import { asyncHandler } from '../../shared/async-handler.js'

const router = Router()

router.get(
	'/me',
	authMiddleware,
	asyncHandler(async (req, res) => {
		const profile = await userService.getProfile(req.user)
		res.json(profile)
	}),
)

router.post(
	'/me/activity',
	authMiddleware,
	asyncHandler(async (req, res) => {
		const data = await userService.trackActivity(req.user.id, req.body || {}, {
			ip: req.ip,
			userAgent: req.headers['user-agent'] || null,
		})
		res.json(data)
	}),
)

router.get(
	'/',
	authMiddleware,
	requireAdmin,
	asyncHandler(async (req, res) => {
		const users = await userService.listUsers({
			limit: Number(req.query.limit || 20),
			cursor: req.query.cursor || null,
		})
		res.json(users)
	}),
)

router.post(
	'/',
	authMiddleware,
	requireAdmin,
	asyncHandler(async (req, res) => {
		const user = await userService.createUser(req.body, {
			actorUserId: req.user.id,
			ip: req.ip,
			userAgent: req.headers['user-agent'] || null,
		})
		res.status(201).json(user)
	}),
)

router.patch(
	'/:id',
	authMiddleware,
	requireAdmin,
	asyncHandler(async (req, res) => {
		const updated = await userService.updateUser(req.params.id, req.body, {
			actorUserId: req.user.id,
			ip: req.ip,
			userAgent: req.headers['user-agent'] || null,
		})
		res.json(updated)
	}),
)

router.delete(
	'/:id',
	authMiddleware,
	requireAdmin,
	asyncHandler(async (req, res) => {
		const deleted = await userService.deleteUser(req.params.id, {
			actorUserId: req.user.id,
			ip: req.ip,
			userAgent: req.headers['user-agent'] || null,
		})
		res.json(deleted)
	}),
)

export default router
