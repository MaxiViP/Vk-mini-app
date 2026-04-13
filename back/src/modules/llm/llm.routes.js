import crypto from 'node:crypto'
import { Router } from 'express'

import { llmService } from './llm.service.js'
import { usageService } from '../usage/usage.service.js'
import { authMiddleware } from '../auth/auth.middleware.js'
import { requireFields } from '../../shared/validate.js'
import logger from '../../config/logger.js'

const router = Router()

const extractTextContent = messageContent => {
	if (typeof messageContent === 'string') return messageContent
	if (!Array.isArray(messageContent)) return ''

	return messageContent
		.map(item => {
			if (!item || typeof item !== 'object') return ''
			if (item.type === 'text') return item.text || ''
			return ''
		})
		.join('')
}

const chunkText = (text, size = 160) => {
	const normalized = typeof text === 'string' ? text : ''
	const chunks = []

	for (let index = 0; index < normalized.length; index += size) {
		chunks.push(normalized.slice(index, index + size))
	}

	return chunks.length ? chunks : ['']
}

router.get('/models', async (_req, res, next) => {
	try {
		const models = await llmService.listModels()
		res.json(models)
	} catch (error) {
		logger.error('LLM models route failed', {
			message: error.message,
			statusCode: error.statusCode || null,
		})
		next(error)
	}
})

router.post('/chat', authMiddleware, async (req, res, next) => {
	const requestId = req.header('X-Request-Id') || crypto.randomUUID()

	try {
		requireFields(req.body, ['message', 'modelId'])

		const resolvedModel = await llmService.resolveModel({
			modelId: req.body.modelId,
			userId: req.user.id,
		})

		await usageService.beginCharge({
			userId: req.user.id,
			modelProvider: resolvedModel.provider,
			modelName: resolvedModel.model,
			modelTier: resolvedModel.billingTier,
			requestId,
		})

		const { completion } = await llmService.chat({
			message: req.body.message,
			selectedModel: resolvedModel,
			history: req.body.history || [],
			userId: req.user.id,
			maxTokens: req.body.maxTokens || 1000,
		})

		const content = extractTextContent(completion?.choices?.[0]?.message?.content || '')
		const inputTokens = Number(completion?.usage?.prompt_tokens || 0)
		const outputTokens = Number(completion?.usage?.completion_tokens || 0)

		await usageService.finalizeCharge({
			requestId,
			inputTokens,
			outputTokens,
		})

		res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
		res.setHeader('Cache-Control', 'no-cache, no-transform')
		res.setHeader('Connection', 'keep-alive')

		if (typeof res.flushHeaders === 'function') {
			res.flushHeaders()
		}

		for (const chunk of chunkText(content)) {
			res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`)
		}

		res.write('data: [DONE]\n\n')
		res.end()
	} catch (error) {
		try {
			await usageService.rollbackCharge({ requestId })
		} catch (rollbackError) {
			logger.error('Usage rollback failed', {
				requestId,
				message: rollbackError.message,
			})
		}

		logger.error('LLM chat route failed', {
			modelId: req.body?.modelId || null,
			message: error.message,
			statusCode: error.statusCode || null,
			requestId,
		})

		next(error)
	}
})

export default router
