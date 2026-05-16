import app from './app.js'
import env from './config/env.js'
import logger from './config/logger.js'
import { llmService } from './modules/llm/llm.service.js'

app.listen(env.port, () => {
	logger.info(`Backend running on http://localhost:${env.port}`)
	void llmService.initializeModelHealthcheck().catch(error => {
		logger.warn('LLM startup model healthcheck failed', {
			message: error?.message || 'Unknown startup healthcheck error',
		})
	})
})
