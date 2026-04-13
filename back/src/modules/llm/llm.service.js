import { OpenAI } from 'openai'

import logger from '../../config/logger.js'
import { resolveModelTier } from '../billing/billing.catalog.js'
import { githubModelsClient } from './githubModels.client.js'

const sanitizeEnv = value => (typeof value === 'string' ? value.trim().replace(/^['"]|['"]$/g, '') : '')

const createOpenAICompatibleClient = ({ apiKey, baseURL, defaultHeaders } = {}) => {
	if (!sanitizeEnv(apiKey) || !sanitizeEnv(baseURL)) return null

	return new OpenAI({
		apiKey: sanitizeEnv(apiKey),
		baseURL: sanitizeEnv(baseURL),
		...(defaultHeaders ? { defaultHeaders } : {}),
	})
}

const openaiClient = sanitizeEnv(process.env.OPENAI_API_KEY)
	? new OpenAI({ apiKey: sanitizeEnv(process.env.OPENAI_API_KEY) })
	: null

const groqClient = createOpenAICompatibleClient({
	apiKey: process.env.GROQ_API_KEY,
	baseURL: 'https://api.groq.com/openai/v1',
})

const openrouterClient = createOpenAICompatibleClient({
	apiKey: process.env.OPENROUTER_API_KEY,
	baseURL: 'https://openrouter.ai/api/v1',
	defaultHeaders: {
		'HTTP-Referer': sanitizeEnv(process.env.OPENROUTER_SITE_URL) || 'https://vk.com',
		'X-Title': sanitizeEnv(process.env.OPENROUTER_APP_NAME) || 'VK Mini App',
	},
})

const cerebrasClient = createOpenAICompatibleClient({
	apiKey: process.env.CEREBRAS_API_KEY,
	baseURL: 'https://api.cerebras.ai/v1',
})

const vercelClient = createOpenAICompatibleClient({
	apiKey: process.env.VERCEL_AI_GATEWAY_API_KEY,
	baseURL: 'https://ai-gateway.vercel.sh/v1',
})

const mistralClient = createOpenAICompatibleClient({
	apiKey: process.env.MISTRAL_API_KEY,
	baseURL: 'https://api.mistral.ai/v1',
})

const cfAccountId = sanitizeEnv(process.env.CF_AIG_ACCOUNT_ID)
const cfGatewayId = sanitizeEnv(process.env.CF_AIG_GATEWAY_ID)
const cloudflareBaseUrl =
	cfAccountId && cfGatewayId ? `https://gateway.ai.cloudflare.com/v1/${cfAccountId}/${cfGatewayId}/openai` : null

const cloudflareClient =
	cloudflareBaseUrl && sanitizeEnv(process.env.CF_AIG_TOKEN)
		? new OpenAI({
				apiKey: sanitizeEnv(process.env.CF_AIG_TOKEN),
				baseURL: cloudflareBaseUrl,
			})
		: null

const LOCAL_LLM_BASE_URL =
	process.env.LOCAL_LLM_BASE_URL || process.env.LOCAL_MODEL_BASE_URL || 'http://127.0.0.1:8000/v1'

const FREE_MODEL_PROVIDERS = new Set(['groq', 'openrouter', 'cloudflare', 'cerebras', 'vercel', 'github', 'mistral'])

const REQUESTS_PER_ROTATION = 3
const CACHE_TTL_MS = 5 * 60 * 1000

const userRequestCounters = new Map()

const decorateModel = model => ({
	...model,
	billingTier: resolveModelTier(model),
})

const OPENAI_FALLBACK_MODELS = [
	{ id: 'openai-gpt-4o-mini', name: 'OpenAI: GPT-4o mini', provider: 'openai', model: 'gpt-4o-mini' },
	{ id: 'openai-gpt-4.1-mini', name: 'OpenAI: GPT-4.1 mini', provider: 'openai', model: 'gpt-4.1-mini' },
].map(decorateModel)

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
].map(decorateModel)

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
].map(decorateModel)

const CEREBRAS_FALLBACK_MODELS = [
	{
		id: 'cerebras-llama-3.3-70b',
		name: 'Cerebras: Llama 3.3 70B',
		provider: 'cerebras',
		model: 'llama-3.3-70b',
	},
	{
		id: 'cerebras-llama-3.1-8b',
		name: 'Cerebras: Llama 3.1 8B',
		provider: 'cerebras',
		model: 'llama3.1-8b',
	},
].map(decorateModel)

const VERCEL_FALLBACK_MODELS = [
	{
		id: 'vercel-gpt-4o-mini',
		name: 'Vercel: GPT-4o mini',
		provider: 'vercel',
		model: 'openai/gpt-4o-mini',
	},
	{
		id: 'vercel-claude-3.5-haiku',
		name: 'Vercel: Claude 3.5 Haiku',
		provider: 'vercel',
		model: 'anthropic/claude-3-5-haiku',
	},
].map(decorateModel)

const MISTRAL_FALLBACK_MODELS = [
	{
		id: 'mistral-small-latest',
		name: 'Mistral: Small Latest',
		provider: 'mistral',
		model: 'mistral-small-latest',
	},
	{
		id: 'mistral-nemo',
		name: 'Mistral: Nemo',
		provider: 'mistral',
		model: 'open-mistral-nemo',
	},
].map(decorateModel)

const GITHUB_MODELS = [
	{
		id: 'github-gpt-4o-mini',
		name: 'GitHub: GPT-4o mini',
		provider: 'github',
		model: 'openai/gpt-4o-mini',
	},
	{
		id: 'github-llama-3.3-70b',
		name: 'GitHub: Llama 3.3 70B',
		provider: 'github',
		model: 'meta/Llama-3.3-70B-Instruct',
	},
].map(decorateModel)

const CLOUDFLARE_MODELS = [
	{ id: 'cf-gpt4o', name: 'GPT-4o (Cloudflare)', provider: 'cloudflare', model: 'gpt-4o' },
	{
		id: 'cf-llama3-70b',
		name: 'Llama 3 70B (Cloudflare)',
		provider: 'cloudflare',
		model: '@cf/meta/llama-3-70b-instruct',
	},
].map(decorateModel)

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
].map(decorateModel)

let modelsCache = null
let cacheTimestamp = 0

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
		case 'openai':
			if (!openaiClient) throw new Error('OpenAI is not configured: set OPENAI_API_KEY')
			return openaiClient
		case 'groq':
			if (!groqClient) throw new Error('Groq is not configured: set GROQ_API_KEY')
			return groqClient
		case 'openrouter':
			if (!openrouterClient) throw new Error('OpenRouter is not configured: set OPENROUTER_API_KEY')
			return openrouterClient
		case 'cerebras':
			if (!cerebrasClient) throw new Error('Cerebras is not configured: set CEREBRAS_API_KEY')
			return cerebrasClient
		case 'vercel':
			if (!vercelClient) throw new Error('Vercel AI Gateway is not configured: set VERCEL_AI_GATEWAY_API_KEY')
			return vercelClient
		case 'mistral':
			if (!mistralClient) throw new Error('Mistral is not configured: set MISTRAL_API_KEY')
			return mistralClient
		case 'github':
			return githubModelsClient
		case 'cloudflare':
			if (!cloudflareClient) {
				throw new Error(
					'Cloudflare AI Gateway is not configured: set CF_AIG_ACCOUNT_ID, CF_AIG_GATEWAY_ID, CF_AIG_TOKEN',
				)
			}
			return cloudflareClient
		case 'local':
			return new OpenAI({
				apiKey: sanitizeEnv(process.env.LOCAL_API_KEY) || 'sk-no-key-needed',
				baseURL: selectedModel.baseUrl || LOCAL_LLM_BASE_URL,
			})
		default:
			if (!openaiClient) throw new Error('OpenAI is not configured: set OPENAI_API_KEY')
			return openaiClient
	}
}

const resolveModelForRequest = (allModels, selectedModel, userId) => {
	if (!selectedModel || !FREE_MODEL_PROVIDERS.has(selectedModel.provider)) {
		return selectedModel
	}

	const rotationPool = allModels.filter(
		model => FREE_MODEL_PROVIDERS.has(model.provider) && model.billingTier === selectedModel.billingTier,
	)

	if (rotationPool.length < 2) return selectedModel

	const currentCount = userRequestCounters.get(userId || 'guest') || 0
	const nextCount = currentCount + 1
	userRequestCounters.set(userId || 'guest', nextCount)

	if (nextCount % REQUESTS_PER_ROTATION !== 0) return selectedModel

	const currentIndex = rotationPool.findIndex(model => model.id === selectedModel.id)
	if (currentIndex === -1) return selectedModel

	const rotatedModel = rotationPool[(currentIndex + 1) % rotationPool.length]

	logger.info('Auto-rotated free model', {
		userId: userId || 'guest',
		fromModelId: selectedModel.id,
		toModelId: rotatedModel.id,
		requestCount: nextCount,
	})

	return rotatedModel
}

const safeListModels = async (client, provider, fallbackModels = []) => {
	if (!client?.models?.list) return fallbackModels

	try {
		const response = await client.models.list()
		const dynamicModels = Array.isArray(response?.data)
			? response.data.map(model =>
					decorateModel({
						id: `${provider}-${model.id}`,
						name: `${provider.toUpperCase()}: ${model.id}`,
						provider,
						model: model.id,
					}),
				)
			: []

		return dedupeModels([...dynamicModels, ...fallbackModels])
	} catch (error) {
		logger.warn(`Failed to load models from ${provider}`, {
			message: error.message,
			status: error.status || null,
		})
		return fallbackModels
	}
}

const withTimeout = (promise, timeoutMs, errorMessage = 'Timeout') =>
	Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(errorMessage)), timeoutMs))])

const withRetry = async (fn, maxRetries = 3, delayMs = 1000) => {
	for (let index = 0; index < maxRetries; index += 1) {
		try {
			return await fn()
		} catch (error) {
			if (index === maxRetries - 1) throw error
			logger.warn(`Retry ${index + 1} failed: ${error.message}`)
			await new Promise(resolve => setTimeout(resolve, delayMs * (index + 1)))
		}
	}
}

export const llmService = {
	async listModels() {
		const now = Date.now()
		if (modelsCache && now - cacheTimestamp < CACHE_TTL_MS) return modelsCache

		const [openaiModels, groqModels, openrouterModels, cerebrasModels, vercelModels, mistralModels] = await Promise.all(
			[
				safeListModels(openaiClient, 'openai', OPENAI_FALLBACK_MODELS),
				safeListModels(groqClient, 'groq', GROQ_FALLBACK_MODELS),
				safeListModels(openrouterClient, 'openrouter', OPENROUTER_FALLBACK_MODELS),
				safeListModels(cerebrasClient, 'cerebras', CEREBRAS_FALLBACK_MODELS),
				safeListModels(vercelClient, 'vercel', VERCEL_FALLBACK_MODELS),
				safeListModels(mistralClient, 'mistral', MISTRAL_FALLBACK_MODELS),
			],
		)

		modelsCache = dedupeModels([
			...openaiModels,
			...groqModels,
			...openrouterModels,
			...cerebrasModels,
			...vercelModels,
			...mistralModels,
			...(cloudflareClient ? CLOUDFLARE_MODELS : []),
			...GITHUB_MODELS,
			...LOCAL_MODELS,
		])

		cacheTimestamp = now
		return modelsCache
	},

	async resolveModel({ modelId, userId }) {
		const allModels = await this.listModels()
		const selectedModel = allModels.find(model => model.id === modelId)

		if (!selectedModel) {
			const error = new Error('Model not found')
			error.statusCode = 400
			throw error
		}

		return resolveModelForRequest(allModels, selectedModel, userId)
	},

	async chat({ message, modelId, selectedModel, history = [], userId, maxTokens = 1000 }) {
		if (!message) throw new Error('Message is required')
		if (typeof message !== 'string') throw new Error('Message must be a string')
		if (message.length > 4000) throw new Error('Message too long')

		const effectiveModel = selectedModel || (await this.resolveModel({ modelId, userId }))
		const client = getClientForModel(effectiveModel)

		const messages = [
			...history.map(item => ({
				role: item.role,
				content: item.content,
			})),
			{ role: 'user', content: message },
		]

		try {
			const completion = await withRetry(() =>
				withTimeout(
					client.chat.completions.create({
						model: effectiveModel.model,
						messages,
						temperature: 0.7,
						max_tokens: maxTokens,
					}),
					30000,
					'LLM request timeout',
				),
			)

			return {
				model: effectiveModel,
				completion,
			}
		} catch (error) {
			logger.error('LLM request failed', {
				error: error.message,
				modelId: effectiveModel.id,
				effectiveModelId: effectiveModel.id,
				userId,
				messageLength: message.length,
			})
			throw new Error(error.message || 'LLM service unavailable')
		}
	},
}
