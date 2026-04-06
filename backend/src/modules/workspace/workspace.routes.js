import { Router } from 'express'

import { authMiddleware } from '../auth/auth.middleware.js'
import { requireFields } from '../../shared/validate.js'
import { workspaceService } from './workspace.service.js'

const router = Router()

router.use(authMiddleware)

router.get('/me', async (req, res, next) => {
	try {
		const workspace = await workspaceService.getWorkspace(req.user.id)
		res.json(workspace)
	} catch (error) {
		next(error)
	}
})

router.put('/me/chat-history', async (req, res, next) => {
	try {
		requireFields(req.body, ['chatHistory'])
		const payload = await workspaceService.saveChatHistory(req.user.id, req.body.chatHistory)
		res.json(payload)
	} catch (error) {
		next(error)
	}
})

router.put('/me/notes', async (req, res, next) => {
	try {
		requireFields(req.body, ['notesPayload'])
		const payload = await workspaceService.saveNotesPayload(req.user.id, req.body.notesPayload)
		res.json(payload)
	} catch (error) {
		next(error)
	}
})

export default router
