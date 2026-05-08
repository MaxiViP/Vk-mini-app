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
	accessTokenTtl: process.env.ACCESS_TOKEN_TTL || '24h',
	refreshTokenTtlDays: toInt(process.env.REFRESH_TOKEN_TTL_DAYS, 30),
	openaiApiKey: process.env.OPENAI_API_KEY || '',
	vkAiBackendUrl: process.env.VK_AI_BACKEND_URL || 'http://195.140.146.86:8000',
	vkAiBackendApiKey: process.env.VK_AI_BACKEND_API_KEY || 'default-dev-key',
	vkAiBackendTimeoutMs: toInt(process.env.VK_AI_BACKEND_TIMEOUT_MS, 60000),
	vkAiClientId: process.env.VK_AI_CLIENT_ID || 'main-prod',
	vkAiMaxFileBytes: toInt(process.env.VK_AI_MAX_FILE_BYTES, 20 * 1024 * 1024),
	vkAiMaxAudioBytes: toInt(process.env.VK_AI_MAX_AUDIO_BYTES, 25 * 1024 * 1024),
	logLevel: process.env.LOG_LEVEL || 'info',
}

export default env
