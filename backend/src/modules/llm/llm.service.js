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

const CLOUDFLARE_MODELS = [
	{ id: 'cf-gpt4o', name: 'GPT-4o (Cloudflare)', provider: 'cloudflare', model: 'gpt-4o' },
	{
		id: 'cf-llama3-70b',
		name: 'Llama 3 70B (Cloudflare)',
		provider: 'cloudflare',
		model: '@cf/meta/llama-3-70b-instruct',
	},
]

const LOCAL_MODELS = [
	{
		id: 'my-marketing',
		name: 'Специалист по маркетингу',
		provider: 'local',
		model: 'my-marketing-v1',
		baseUrl: 'http://192.168.1.100:8000/v1',
	},
	{
		id: 'my-legal',
		name: 'Юрист РФ',
		provider: 'local',
		model: 'my-legal-v2',
		baseUrl: 'http://192.168.1.100:8000/v1',
	},
]

let modelsCache = null
let cacheTimestamp = 0
const CACHE_TTL_MS = 5 * 60 * 1000

const safeListModels = async (client, provider) => {
	try {
		const response = await client.models.list()
		return response.data.map(model => ({
			id: `${provider}-${model.id}`,
			name: `${provider.toUpperCase()}: ${model.id}`,
			provider,
			model: model.id,
		}))
	} catch (error) {
		logger.warn(`Failed to load models from ${provider}`, {
			message: error.message,
			status: error.status || null,
		})
		return []
	}
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
				baseURL: selectedModel.baseUrl,
			})
		default:
			return openaiClient
	}
}

export const llmService = {
	async listModels() {
		const now = Date.now()
		if (modelsCache && now - cacheTimestamp < CACHE_TTL_MS) {
			return modelsCache
		}

		const [openaiModels, groqModels, openrouterModels] = await Promise.all([
			safeListModels(openaiClient, 'openai'),
			safeListModels(groqClient, 'groq'),
			safeListModels(openrouterClient, 'openrouter'),
		])

		modelsCache = [...openaiModels, ...groqModels, ...openrouterModels, ...CLOUDFLARE_MODELS, ...LOCAL_MODELS]
		cacheTimestamp = now

		return modelsCache
	},

	async chat({ message, modelId, history = [] }) {
		const allModels = await this.listModels()
		const selectedModel = allModels.find(model => model.id === modelId)

		if (!selectedModel) {
			const error = new Error('Модель не найдена')
			error.statusCode = 400
			throw error
		}

		const client = getClientForModel(selectedModel)
		const messages = [
			...history.map(item => ({ role: item.role, content: item.content })),
			{ role: 'user', content: message },
		]

		return client.chat.completions.create({
			model: selectedModel.model,
			messages,
			stream: true,
			temperature: 0.7,
		})
	},
}
