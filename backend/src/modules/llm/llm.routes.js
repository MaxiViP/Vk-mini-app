import { Router } from 'express'

import { llmService } from './llm.service.js'
import { requireFields } from '../../shared/validate.js'
import logger from '../../config/logger.js'

const router = Router()

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

router.post('/chat', async (req, res, next) => {
	try {
		requireFields(req.body, ['message', 'modelId'])
		const stream = await llmService.chat({ ...req.body, stream: true })

		res.setHeader('Content-Type', 'text/event-stream')
		res.setHeader('Cache-Control', 'no-cache')
		res.setHeader('Connection', 'keep-alive')

		for await (const chunk of stream) {
			const content = chunk.choices?.[0]?.delta?.content || ''
			if (content) {
				res.write(`data: ${content}\n\n`)
			}
		}

		res.write('data: [DONE]\n\n')
		res.end()
	} catch (error) {
		logger.error('LLM chat route failed', {
			modelId: req.body?.modelId || null,
			message: error.message,
			statusCode: error.statusCode || null,
		})
		next(error)
	}
})

export default router
