import app from './app.js'
import env from './config/env.js'
import logger from './config/logger.js'
import { ensurePrismaReady } from './db/prisma.js'

try {
	await ensurePrismaReady()

	app.listen(env.port, () => {
		logger.info(`Backend running on http://localhost:${env.port}`)
	})
} catch (error) {
	logger.error('Server bootstrap failed', {
		message: error instanceof Error ? error.message : 'Unknown bootstrap error',
	})
	process.exit(1)
}
