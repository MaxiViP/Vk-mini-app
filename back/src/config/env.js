import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const backendEnvPath = path.resolve(__dirname, '../../.env')

dotenv.config({ path: backendEnvPath })

const toInt = (value, fallback) => {
	const parsed = Number.parseInt(value ?? '', 10)
	return Number.isNaN(parsed) ? fallback : parsed
}

const env = {
	nodeEnv: process.env.NODE_ENV || 'development',
	port: toInt(process.env.PORT, 3000),
	databaseUrl: process.env.DATABASE_URL || '',
	jwtSecret: process.env.JWT_SECRET || 'change_me_in_prod',
	openaiApiKey: process.env.OPENAI_API_KEY || '',
	vkAiBackendUrl: process.env.VK_AI_BACKEND_URL || '',
	vkAiBackendApiKey: process.env.VK_AI_BACKEND_API_KEY || '',
	vkAiBackendTimeoutMs: toInt(process.env.VK_AI_BACKEND_TIMEOUT_MS, 30000),
	logLevel: process.env.LOG_LEVEL || 'info',
}

export default env
