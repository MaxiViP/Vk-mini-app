import { Router } from 'express'

import { llmService } from './llm.service.js'
import { requireFields } from '../../shared/validate.js'

const router = Router()

router.get('/models', async (_req, res, next) => {
	try {
		const models = await llmService.listModels()
		res.json(models)
	} catch (error) {
		next(error)
	}
})

router.post('/chat', async (req, res, next) => {
	try {
		requireFields(req.body, ['message', 'modelId'])
		const stream = await llmService.chat(req.body)

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
		next(error)
	}
})

export default router
