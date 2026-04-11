import { Router } from 'express'

import { authMiddleware } from '../auth/auth.middleware.js'
import { requireFields } from '../../shared/validate.js'
import { workspaceService } from './workspace.service.js'
import { asyncHandler } from '../../shared/async-handler.js'

const router = Router()

router.use(authMiddleware)

router.get(
	'/me',
	asyncHandler(async (req, res) => {
		const workspace = await workspaceService.getWorkspace(req.user.id)
		res.json(workspace)
	}),
)

router.put(
	'/me/chat-history',
	asyncHandler(async (req, res) => {
		requireFields(req.body, ['chatHistory'])
		const payload = await workspaceService.saveChatHistory(req.user.id, req.body.chatHistory)
		res.json(payload)
	}),
)

router.put(
	'/me/notes',
	asyncHandler(async (req, res) => {
		requireFields(req.body, ['notesPayload'])
		const payload = await workspaceService.saveNotesPayload(req.user.id, req.body.notesPayload)
		res.json(payload)
	}),
)

export default router
