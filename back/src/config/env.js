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

const trim = value => String(value || '').trim()
const nodeEnv = trim(process.env.NODE_ENV) || 'development'
const isProduction = nodeEnv === 'production'
const databaseUrl = trim(process.env.DATABASE_URL)
const jwtSecret = trim(process.env.JWT_SECRET)
const vkAiBackendUrl = trim(process.env.VK_AI_BACKEND_URL)
const vkAiBackendApiKey = trim(process.env.VK_AI_BACKEND_API_KEY)
const usesAiBackend = true

const assertRequired = (name, value) => {
	if (isProduction && !value) {
		throw new Error(`${name} is required in production`)
	}
}

assertRequired('JWT_SECRET', jwtSecret)
assertRequired('DATABASE_URL', databaseUrl)

if (usesAiBackend) {
	assertRequired('VK_AI_BACKEND_URL', vkAiBackendUrl)
}

const env = {
	nodeEnv,
	port: toInt(process.env.PORT, 3000),
	databaseUrl,
	jwtSecret,
	openaiApiKey: trim(process.env.OPENAI_API_KEY),
	vkAiBackendUrl,
	vkAiBackendApiKey,
	vkAiBackendTimeoutMs: toInt(process.env.VK_AI_BACKEND_TIMEOUT_MS, 30000),
	logLevel: trim(process.env.LOG_LEVEL) || 'info',
}

export default env
