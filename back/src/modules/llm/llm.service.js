import { OpenAI } from 'openai'

import logger from '../../config/logger.js'
import { resolveModelTier } from '../billing/billing.catalog.js'
import { githubModelsClient } from './githubModels.client.js'

const sanitizeEnv = value => (typeof value === 'string' ? value.trim().replace(/^['"]|['"]$/g, '') : '')
const toPositiveInt = (value, fallback) => {
	const parsed = Number(value)
	return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

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
const MODEL_DISCOVERY_TIMEOUT_MS = 4000
const LLM_DYNAMIC_MODEL_DISCOVERY = sanitizeEnv(process.env.LLM_DYNAMIC_MODEL_DISCOVERY).toLowerCase() === 'true'
const LLM_STARTUP_MODEL_CHECK = sanitizeEnv(process.env.LLM_STARTUP_MODEL_CHECK).toLowerCase() !== 'false'
const LLM_MODEL_HEALTHCHECK_TIMEOUT_MS = toPositiveInt(process.env.LLM_MODEL_HEALTHCHECK_TIMEOUT_MS, 8000)
const LLM_MODEL_HEALTHCHECK_CONCURRENCY = toPositiveInt(process.env.LLM_MODEL_HEALTHCHECK_CONCURRENCY, 3)
const LLM_MODEL_HEALTHCHECK_PROMPT = sanitizeEnv(process.env.LLM_MODEL_HEALTHCHECK_PROMPT) || 'ping'

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
let modelCandidatesCache = null
let modelCandidatesCacheTimestamp = 0
let modelHealthcheckPromise = null

const dedupeModels = models => {
	const seen = new Set()

	return models.filter(model => {
		if (!model?.id || seen.has(model.id)) return false
		seen.add(model.id)
		return true
	})
}

const getStaticModelFallbacks = () =>
	dedupeModels([
		...OPENAI_FALLBACK_MODELS,
		...GROQ_FALLBACK_MODELS,
		...OPENROUTER_FALLBACK_MODELS,
		...CEREBRAS_FALLBACK_MODELS,
		...VERCEL_FALLBACK_MODELS,
		...MISTRAL_FALLBACK_MODELS,
		...(cloudflareClient ? CLOUDFLARE_MODELS : []),
		...GITHUB_MODELS,
		...LOCAL_MODELS,
	])

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

const withTimeout = (promise, timeoutMs, errorMessage = 'Timeout') => {
	let timeoutId
	const timeoutPromise = new Promise((_, reject) => {
		timeoutId = setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
	})

	return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId))
}

const safeListModels = async (client, provider, fallbackModels = []) => {
	if (!client?.models?.list) return fallbackModels

	try {
		const response = await withTimeout(
			client.models.list(),
			MODEL_DISCOVERY_TIMEOUT_MS,
			`Model discovery timeout after ${MODEL_DISCOVERY_TIMEOUT_MS}ms`,
		)
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
			message: error?.message || 'Unknown model discovery error',
			status: error?.status || null,
		})
		return fallbackModels
	}
}

const getDynamicModelProviders = () => [
	{ client: openaiClient, name: 'openai', fallbackModels: OPENAI_FALLBACK_MODELS },
	{ client: groqClient, name: 'groq', fallbackModels: GROQ_FALLBACK_MODELS },
	{ client: openrouterClient, name: 'openrouter', fallbackModels: OPENROUTER_FALLBACK_MODELS },
	{ client: cerebrasClient, name: 'cerebras', fallbackModels: CEREBRAS_FALLBACK_MODELS },
	{ client: vercelClient, name: 'vercel', fallbackModels: VERCEL_FALLBACK_MODELS },
	{ client: mistralClient, name: 'mistral', fallbackModels: MISTRAL_FALLBACK_MODELS },
]

const loadModelCandidates = async () => {
	const now = Date.now()
	if (modelCandidatesCache && now - modelCandidatesCacheTimestamp < CACHE_TTL_MS) return modelCandidatesCache

	if (!LLM_DYNAMIC_MODEL_DISCOVERY) {
		modelCandidatesCache = getStaticModelFallbacks()
		modelCandidatesCacheTimestamp = now
		return modelCandidatesCache
	}

	const providers = getDynamicModelProviders()
	const settledResults = await Promise.allSettled(
		providers.map(provider => safeListModels(provider.client, provider.name, provider.fallbackModels)),
	)

	const discoveredModels = settledResults.flatMap((result, index) => {
		if (result.status === 'fulfilled') return result.value

		const provider = providers[index]
		logger.warn(`Failed to load models from ${provider.name}`, {
			message: result.reason?.message || 'Unknown model discovery error',
			status: result.reason?.status || null,
		})
		return provider.fallbackModels
	})

	modelCandidatesCache = dedupeModels([
		...discoveredModels,
		...(cloudflareClient ? CLOUDFLARE_MODELS : []),
		...GITHUB_MODELS,
		...LOCAL_MODELS,
	])
	modelCandidatesCacheTimestamp = now
	return modelCandidatesCache
}

const mapWithConcurrency = async (items, concurrency, mapper) => {
	const results = new Array(items.length)
	let nextIndex = 0

	const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
		while (nextIndex < items.length) {
			const index = nextIndex
			nextIndex += 1
			results[index] = await mapper(items[index], index)
		}
	})

	await Promise.all(workers)
	return results
}

const normalizeHealthcheckError = error => ({
	message: error?.message || 'Unknown model healthcheck error',
	status: error?.status || error?.statusCode || error?.response?.status || null,
	code: error?.code || error?.type || null,
})

const checkModelAvailability = async model => {
	const startedAt = Date.now()

	try {
		const client = getClientForModel(model)
		if (!client?.chat?.completions?.create) throw new Error('Client does not support chat completions')

		await withTimeout(
			client.chat.completions.create({
				model: model.model,
				messages: [{ role: 'user', content: LLM_MODEL_HEALTHCHECK_PROMPT }],
				temperature: 0,
				max_tokens: 1,
			}),
			LLM_MODEL_HEALTHCHECK_TIMEOUT_MS,
			`Model healthcheck timeout after ${LLM_MODEL_HEALTHCHECK_TIMEOUT_MS}ms`,
		)

		const latencyMs = Date.now() - startedAt
		logger.info('LLM model healthcheck available', {
			modelId: model.id,
			modelName: model.model,
			provider: model.provider,
			billingTier: model.billingTier,
			latencyMs,
		})

		return { ok: true, model, latencyMs }
	} catch (error) {
		const latencyMs = Date.now() - startedAt
		const normalizedError = normalizeHealthcheckError(error)
		logger.warn('LLM model healthcheck unavailable', {
			modelId: model.id,
			modelName: model.model,
			provider: model.provider,
			billingTier: model.billingTier,
			latencyMs,
			...normalizedError,
		})

		return { ok: false, model, latencyMs, error: normalizedError }
	}
}

const healthcheckModels = async candidateModels => {
	const models = dedupeModels(candidateModels)
	logger.info('LLM model healthcheck started', {
		modelCount: models.length,
		timeoutMs: LLM_MODEL_HEALTHCHECK_TIMEOUT_MS,
		concurrency: LLM_MODEL_HEALTHCHECK_CONCURRENCY,
	})

	if (!models.length) {
		logger.warn('LLM model healthcheck skipped: no candidate models')
		return getStaticModelFallbacks()
	}

	const results = await mapWithConcurrency(models, LLM_MODEL_HEALTHCHECK_CONCURRENCY, checkModelAvailability)
	const availableResults = results.filter(result => result.ok)
	const unavailableResults = results.filter(result => !result.ok)
	const availableModels = availableResults.map(result => result.model)

	logger.info('LLM model healthcheck completed', {
		availableCount: availableResults.length,
		unavailableCount: unavailableResults.length,
		availableModels: availableResults.map(result => ({
			id: result.model.id,
			provider: result.model.provider,
			latencyMs: result.latencyMs,
		})),
		unavailableModels: unavailableResults.map(result => ({
			id: result.model.id,
			provider: result.model.provider,
			latencyMs: result.latencyMs,
			status: result.error?.status || null,
			code: result.error?.code || null,
			message: result.error?.message || null,
		})),
	})

	if (!availableModels.length) {
		logger.warn('LLM model healthcheck found no available models; using static fallback model list')
		return getStaticModelFallbacks()
	}

	return dedupeModels(availableModels)
}

const getHealthcheckedModels = async () => {
	if (modelHealthcheckPromise) return modelHealthcheckPromise

	modelHealthcheckPromise = (async () => {
		try {
			const candidateModels = await loadModelCandidates()
			const healthyModels = await healthcheckModels(candidateModels)
			modelsCache = healthyModels
			cacheTimestamp = Date.now()
			return modelsCache
		} catch (error) {
			logger.warn('LLM model healthcheck failed; using static fallback model list', {
				message: error?.message || 'Unknown model healthcheck failure',
				status: error?.status || null,
			})
			modelsCache = getStaticModelFallbacks()
			cacheTimestamp = Date.now()
			return modelsCache
		} finally {
			modelHealthcheckPromise = null
		}
	})()

	return modelHealthcheckPromise
}

const selectClosestAvailableModel = (availableModels, requestedModel) => {
	const sameProviderAndTier = availableModels.find(
		model => model.provider === requestedModel.provider && model.billingTier === requestedModel.billingTier,
	)
	if (sameProviderAndTier) return sameProviderAndTier

	const sameProvider = availableModels.find(model => model.provider === requestedModel.provider)
	if (sameProvider) return sameProvider

	const sameTier = availableModels.find(model => model.billingTier === requestedModel.billingTier)
	if (sameTier) return sameTier

	return availableModels[0] || null
}

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
	async initializeModelHealthcheck() {
		if (!LLM_STARTUP_MODEL_CHECK) {
			logger.info('LLM startup model healthcheck disabled')
			return null
		}

		return this.listModels()
	},

	async listModels() {
		const now = Date.now()
		if (modelsCache && now - cacheTimestamp < CACHE_TTL_MS) return modelsCache

		try {
			modelsCache = LLM_STARTUP_MODEL_CHECK ? await getHealthcheckedModels() : await loadModelCandidates()
			cacheTimestamp = now
			return modelsCache
		} catch (error) {
			logger.warn('Failed to list dynamic LLM models; returning static fallbacks', {
				message: error?.message || 'Unknown model listing error',
			})
			modelsCache = getStaticModelFallbacks()
			cacheTimestamp = now
			return modelsCache
		}
	},

	async resolveModel({ modelId, userId }) {
		const allModels = await this.listModels()
		let selectedModel = allModels.find(model => model.id === modelId)

		if (!selectedModel) {
			const requestedModel = (await loadModelCandidates()).find(model => model.id === modelId)
			const fallbackModel = requestedModel ? selectClosestAvailableModel(allModels, requestedModel) : null

			if (fallbackModel) {
				logger.warn('Requested LLM model unavailable; fallback model selected', {
					userId: userId || 'guest',
					requestedModelId: requestedModel.id,
					requestedProvider: requestedModel.provider,
					requestedBillingTier: requestedModel.billingTier,
					fallbackModelId: fallbackModel.id,
					fallbackProvider: fallbackModel.provider,
					fallbackBillingTier: fallbackModel.billingTier,
				})
				selectedModel = fallbackModel
				return selectedModel
			}

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
