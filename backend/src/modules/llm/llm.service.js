import { OpenAI } from 'openai'
import logger from '../../config/logger.js'

const openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' })
const groqClient = new OpenAI({
	apiKey: process.env.GROQ_API_KEY || '',
	baseURL: 'https://api.groq.com/openai/v1',
})
const openrouterClient = new OpenAI({
	apiKey: process.env.OPENROUTER_API_KEY || '',
	baseURL: 'https://openrouter.ai/api/v1',
})
const cloudflareClient = new OpenAI({
	apiKey: process.env.CF_AIG_TOKEN || '',
	baseURL: 'https://gateway.ai.cloudflare.com/v1',
})

const OPENAI_FALLBACK_MODELS = [
	{ id: 'openai-gpt-4o-mini', name: 'OpenAI: GPT-4o mini', provider: 'openai', model: 'gpt-4o-mini' },
	{ id: 'openai-gpt-4.1-mini', name: 'OpenAI: GPT-4.1 mini', provider: 'openai', model: 'gpt-4.1-mini' },
]

const GROQ_FALLBACK_MODELS = [
	{
		id: 'groq-llama-3.3-70b-versatile',
		name: 'Groq: Llama 3.3 70B Versatile',
		provider: 'groq',
		model: 'llama-3.3-70b-versatile',
	},
	{
		id: 'groq-llama-3.1-8b-instant',
		name: 'Groq: Llama 3.1 8B Instant',
		provider: 'groq',
		model: 'llama-3.1-8b-instant',
	},
]

const OPENROUTER_FALLBACK_MODELS = [
	{
		id: 'openrouter-openai-gpt-4o-mini',
		name: 'OpenRouter: GPT-4o mini',
		provider: 'openrouter',
		model: 'openai/gpt-4o-mini',
	},
	{
		id: 'openrouter-anthropic-claude-3.5-haiku',
		name: 'OpenRouter: Claude 3.5 Haiku',
		provider: 'openrouter',
		model: 'anthropic/claude-3.5-haiku',
	},
]

const CLOUDFLARE_MODELS = [
	{ id: 'cf-gpt4o', name: 'GPT-4o (Cloudflare)', provider: 'cloudflare', model: 'gpt-4o' },
	{
		id: 'cf-llama3-70b',
		name: 'Llama 3 70B (Cloudflare)',
		provider: 'cloudflare',
		model: '@cf/meta/llama-3-70b-instruct',
	},
]

const LOCAL_LLM_BASE_URL = process.env.LOCAL_LLM_BASE_URL || process.env.LOCAL_MODEL_BASE_URL || 'http://127.0.0.1:8000/v1'

const LOCAL_MODELS = [
	{
		id: 'my-marketing',
		name: 'Специалист по маркетингу',
		provider: 'local',
		model: 'my-marketing-v1',
		baseUrl: LOCAL_LLM_BASE_URL,
	},
	{
		id: 'my-legal',
		name: 'Юрист РФ',
		provider: 'local',
		model: 'my-legal-v2',
		baseUrl: LOCAL_LLM_BASE_URL,
	},
]

let modelsCache = null
let cacheTimestamp = 0
const CACHE_TTL_MS = 5 * 60 * 1000

const dedupeModels = models => {
	const seen = new Set()
	return models.filter(model => {
		if (!model?.id || seen.has(model.id)) return false
		seen.add(model.id)
		return true
	})
}

const getClientForModel = selectedModel => {
	switch (selectedModel.provider) {
		case 'groq':
			return groqClient
		case 'openrouter':
			return openrouterClient
		case 'cloudflare':
			return cloudflareClient
		case 'local':
			return new OpenAI({
				apiKey: process.env.LOCAL_API_KEY || 'sk-no-key-needed',
				baseURL: selectedModel.baseUrl || LOCAL_LLM_BASE_URL,
			})
		default:
			return openaiClient
	}
}

const safeListModels = async (client, provider, fallbackModels = []) => {
	try {
		const response = await client.models.list()
		const dynamicModels = response.data.map(model => ({
			id: `${provider}-${model.id}`,
			name: `${provider.toUpperCase()}: ${model.id}`,
			provider,
			model: model.id,
		}))
		return dedupeModels([...dynamicModels, ...fallbackModels])
	} catch (error) {
		logger.warn(`Failed to load models from ${provider}`, { message: error.message, status: error.status || null })
		return fallbackModels
	}
}

const withTimeout = (promise, timeoutMs, errorMessage = 'Timeout') =>
	Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(errorMessage)), timeoutMs))])

const withRetry = async (fn, maxRetries = 3, delayMs = 1000) => {
	for (let i = 0; i < maxRetries; i++) {
		try {
			return await fn()
		} catch (error) {
			if (i === maxRetries - 1) throw error
			logger.warn(`Retry ${i + 1} failed: ${error.message}`)
			await new Promise(resolve => setTimeout(resolve, delayMs * (i + 1)))
		}
	}
}

export const llmService = {
	async listModels() {
		const now = Date.now()
		if (modelsCache && now - cacheTimestamp < CACHE_TTL_MS) return modelsCache

		const [openaiModels, groqModels, openrouterModels] = await Promise.all([
			safeListModels(openaiClient, 'openai', OPENAI_FALLBACK_MODELS),
			safeListModels(groqClient, 'groq', GROQ_FALLBACK_MODELS),
			safeListModels(openrouterClient, 'openrouter', OPENROUTER_FALLBACK_MODELS),
		])

		modelsCache = dedupeModels([
			...openaiModels,
			...groqModels,
			...openrouterModels,
			...CLOUDFLARE_MODELS,
			...LOCAL_MODELS,
		])
		cacheTimestamp = now
		return modelsCache
	},

	async chat({ message, modelId, history = [], userId, maxTokens = 1000, stream = false }) {
		if (!message) throw new Error('Message is required')
		if (message.length > 4000) throw new Error('Message too long')

		const allModels = await this.listModels()
		const selectedModel = allModels.find(m => m.id === modelId)
		if (!selectedModel) {
			const error = new Error('Модель не найдена')
			error.statusCode = 400
			throw error
		}

		const client = getClientForModel(selectedModel)
		const messages = [...history.map(h => ({ role: h.role, content: h.content })), { role: 'user', content: message }]

		try {
			if (stream) {
				return client.chat.completions.create({
					model: selectedModel.model,
					messages,
					stream: true,
					temperature: 0.7,
					max_tokens: maxTokens,
				})
			}

			return await withRetry(() =>
				withTimeout(
					client.chat.completions.create({
						model: selectedModel.model,
						messages,
						temperature: 0.7,
						max_tokens: maxTokens,
					}),
					30000,
					'LLM request timeout',
				),
			)
		} catch (error) {
			logger.error('LLM request failed', { error: error.message, modelId, userId, messageLength: message.length })
			throw new Error('LLM service unavailable')
		}
	},
}
