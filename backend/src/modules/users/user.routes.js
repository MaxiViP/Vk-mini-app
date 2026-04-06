import { Router } from 'express'

import { userService } from './user.service.js'
import { authMiddleware } from '../auth/auth.middleware.js'

const router = Router()

router.get('/me', authMiddleware, async (req, res, next) => {
	try {
		const profile = await userService.getProfile(req.user.id)
		res.json(profile)
	} catch (error) {
		next(error)
	}
})

router.get('/', authMiddleware, async (req, res, next) => {
	try {
		const users = await userService.listUsers({
			limit: Number(req.query.limit || 20),
			cursor: req.query.cursor || null,
		})
		res.json(users)
	} catch (error) {
		next(error)
	}
})

router.post('/', authMiddleware, async (req, res, next) => {
	try {
		const user = await userService.createUser(req.body, {
			actorUserId: req.user.id,
			ip: req.ip,
			userAgent: req.headers['user-agent'] || null,
		})
		res.status(201).json(user)
	} catch (error) {
		next(error)
	}
})

router.patch('/:id', authMiddleware, async (req, res, next) => {
	try {
		const updated = await userService.updateUser(req.params.id, req.body, {
			actorUserId: req.user.id,
			ip: req.ip,
			userAgent: req.headers['user-agent'] || null,
		})
		res.json(updated)
	} catch (error) {
		next(error)
	}
})

router.delete('/:id', authMiddleware, async (req, res, next) => {
	try {
		const deleted = await userService.deleteUser(req.params.id, {
			actorUserId: req.user.id,
			ip: req.ip,
			userAgent: req.headers['user-agent'] || null,
		})
		res.json(deleted)
	} catch (error) {
		next(error)
	}
})

export default router
