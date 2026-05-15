import { Readable } from 'node:stream'
import { Router } from 'express'

import { authMiddleware } from '../auth/auth.middleware.js'
import { requireFields } from '../../shared/validate.js'
import { AppError } from '../../shared/errors.js'
import { aiService } from './ai.service.js'

const router = Router()

router.use(authMiddleware)

const buildRequestHeaders = req => {
	const headers = new Headers()

	for (const [key, value] of Object.entries(req.headers || {})) {
		if (Array.isArray(value)) {
			for (const item of value) {
				if (item !== undefined) headers.append(key, String(item))
			}
			continue
		}

		if (value !== undefined) {
			headers.set(key, String(value))
		}
	}

	return headers
}

const parseMultipartForm = async req => {
	const request = new Request('http://localhost/internal-upload', {
		method: req.method,
		headers: buildRequestHeaders(req),
		body: Readable.toWeb(req),
		duplex: 'half',
	})

	return request.formData()
}

const getConversationIdFromForm = formData =>
	String(formData.get('conversationId') || formData.get('conversation_id') || '').trim()

const getFileFromForm = (formData, key) => {
	const value = formData.get(key)
	if (!value || typeof value === 'string' || typeof value.arrayBuffer !== 'function') {
		throw new AppError(`Missing required fields: ${key}`, 400)
	}
	return value
}

const normalizeSelectedFiles = value =>
	Array.isArray(value)
		? value
				.map(item => String(item || '').trim())
				.filter(Boolean)
				.slice(0, 50)
		: undefined

router.get('/plans', async (_req, res, next) => {
	try {
		const result = await aiService.getPlans()
		res.json(result)
	} catch (error) {
		next(error)
	}
})

router.get('/access', async (req, res, next) => {
	try {
		const result = await aiService.getAccess({ userId: req.user.id })
		res.json(result)
	} catch (error) {
		next(error)
	}
})

router.get('/health', async (_req, res, next) => {
	try {
		const result = await aiService.getBackendHealth()
		res.json(result)
	} catch (error) {
		next(error)
	}
})

router.post('/chat', async (req, res, next) => {
	try {
		const mode = String(req.body?.mode || 'context').toLowerCase() === 'simple' ? 'simple' : 'context'
		requireFields(req.body, ['conversationId', 'message'])

		const result = await aiService.sendChat({
			userId: req.user.id,
			conversationId: typeof req.body.conversationId === 'string' ? String(req.body.conversationId) : '',
			message: String(req.body.message),
			sessionContext: typeof req.body.sessionContext === 'string' ? req.body.sessionContext : '',
			selectedFiles: normalizeSelectedFiles(req.body?.selectedFiles),
			mode,
		})

		res.json(result)
	} catch (error) {
		next(error)
	}
})

router.post('/files/upload', async (req, res, next) => {
	try {
		const formData = await parseMultipartForm(req)
		const conversationId = getConversationIdFromForm(formData)
		if (!conversationId) throw new AppError('Missing required fields: conversationId', 400)

		const file = getFileFromForm(formData, 'file')
		const result = await aiService.uploadFile({
			userId: req.user.id,
			conversationId,
			file,
		})

		res.json(result)
	} catch (error) {
		next(error)
	}
})

router.post('/voice', async (req, res, next) => {
	try {
		const formData = await parseMultipartForm(req)
		const conversationId = getConversationIdFromForm(formData)
		if (!conversationId) throw new AppError('Missing required fields: conversationId', 400)

		const file = getFileFromForm(formData, 'audio')
		const result = await aiService.sendVoice({
			userId: req.user.id,
			conversationId,
			file,
		})

		res.json(result)
	} catch (error) {
		next(error)
	}
})

router.get('/conversations', async (req, res, next) => {
	try {
		const result = await aiService.listConversations({
			userId: req.user.id,
		})

		res.json(result)
	} catch (error) {
		next(error)
	}
})

router.get('/conversations/:conversationId', async (req, res, next) => {
	try {
		const conversationId = String(req.params.conversationId || '').trim()
		if (!conversationId) throw new AppError('Missing required fields: conversationId', 400)

		const result = await aiService.getConversation({
			userId: req.user.id,
			conversationId,
		})

		res.json(result)
	} catch (error) {
		next(error)
	}
})

router.get('/history/:conversationId', async (req, res, next) => {
	try {
		const conversationId = String(req.params.conversationId || '').trim()
		if (!conversationId) throw new AppError('Missing required fields: conversationId', 400)

		const result = await aiService.getConversation({
			userId: req.user.id,
			conversationId,
		})

		res.json(result)
	} catch (error) {
		next(error)
	}
})

router.post('/conversations/:conversationId/reset', async (req, res, next) => {
	try {
		const conversationId = String(req.params.conversationId || '').trim()
		if (!conversationId) throw new AppError('Missing required fields: conversationId', 400)

		const result = await aiService.resetConversation({
			userId: req.user.id,
			conversationId,
		})

		res.json(result)
	} catch (error) {
		next(error)
	}
})

router.post('/history/:conversationId/reset', async (req, res, next) => {
	try {
		const conversationId = String(req.params.conversationId || '').trim()
		if (!conversationId) throw new AppError('Missing required fields: conversationId', 400)

		const result = await aiService.resetConversation({
			userId: req.user.id,
			conversationId,
		})

		res.json(result)
	} catch (error) {
		next(error)
	}
})

router.delete('/history/:conversationId/files/:fileName', async (req, res, next) => {
	try {
		const conversationId = String(req.params.conversationId || '').trim()
		const fileName = String(req.params.fileName || '').trim()

		if (!conversationId) throw new AppError('Missing required fields: conversationId', 400)
		if (!fileName) throw new AppError('Missing required fields: fileName', 400)

		const result = await aiService.removeContextFile({
			userId: req.user.id,
			conversationId,
			fileName,
		})

		res.json(result)
	} catch (error) {
		next(error)
	}
})

router.delete('/conversations/:conversationId/files/:fileName', async (req, res, next) => {
	try {
		const conversationId = String(req.params.conversationId || '').trim()
		const fileName = String(req.params.fileName || '').trim()

		if (!conversationId) throw new AppError('Missing required fields: conversationId', 400)
		if (!fileName) throw new AppError('Missing required fields: fileName', 400)

		const result = await aiService.removeContextFile({
			userId: req.user.id,
			conversationId,
			fileName,
		})

		res.json(result)
	} catch (error) {
		next(error)
	}
})
export default router
