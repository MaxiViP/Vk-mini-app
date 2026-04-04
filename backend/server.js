import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { OpenAI } from 'openai'

dotenv.config()

const app = express()
app.use(cors())
app.use(express.json())

// ====================== ИНИЦИАЛИЗАЦИЯ КЛИЕНТОВ ======================
const openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const groqClient = new OpenAI({
	apiKey: process.env.GROQ_API_KEY,
	baseURL: 'https://api.groq.com/openai/v1',
})
const openrouterClient = new OpenAI({
	apiKey: process.env.OPENROUTER_API_KEY,
	baseURL: 'https://openrouter.ai/api/v1',
})

// Cloudflare AI Gateway – статический список моделей
const CLOUDFLARE_MODELS = [
	{ id: 'cf-gpt4o', name: 'GPT-4o (Cloudflare)', provider: 'cloudflare', model: 'gpt-4o' },
	{
		id: 'cf-llama3-70b',
		name: 'Llama 3 70B (Cloudflare)',
		provider: 'cloudflare',
		model: '@cf/meta/llama-3-70b-instruct',
	},
]

// Локальные модели
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

// ====================== ФУНКЦИЯ ПОЛУЧЕНИЯ ВСЕХ МОДЕЛЕЙ ======================
let modelsCache = null
let cacheTimestamp = 0
const CACHE_TTL = 5 * 60 * 1000 // 5 минут

async function fetchAllModels() {
	const now = Date.now()
	if (modelsCache && now - cacheTimestamp < CACHE_TTL) {
		return modelsCache
	}

	const allModels = []
	let openaiCount = 0
	let groqCount = 0
	let openrouterCount = 0

	// 1. OpenAI
	try {
		const openaiModels = await openaiClient.models.list()
		const allOpenaiModels = openaiModels.data.map(m => ({
			id: `openai-${m.id}`,
			name: `OpenAI: ${m.id}`,
			provider: 'openai',
			model: m.id,
		}))
		allModels.push(...allOpenaiModels)
		openaiCount = allOpenaiModels.length
		console.log(`✅ OpenAI: загружено ${openaiCount} моделей`)
	} catch (err) {
		console.error('❌ Ошибка загрузки моделей OpenAI:', err.message)
		if (err.status === 403) console.error('   Возможно, API ключ OpenAI невалидный или регион заблокирован')
	}

	// 2. Groq
	try {
		const groqModels = await groqClient.models.list()
		const allGroqModels = groqModels.data.map(m => ({
			id: `groq-${m.id}`,
			name: `Groq: ${m.id}`,
			provider: 'groq',
			model: m.id,
		}))
		allModels.push(...allGroqModels)
		groqCount = allGroqModels.length
		console.log(`✅ Groq: загружено ${groqCount} моделей`)
	} catch (err) {
		console.error('❌ Ошибка загрузки моделей Groq:', err.message)
		if (err.status === 403) console.error('   Возможно, API ключ Groq невалидный или истёк')
	}

	// 3. OpenRouter
	try {
		const orModels = await openrouterClient.models.list()
		const allOrModels = orModels.data.map(m => ({
			id: `openrouter-${m.id}`,
			name: `OpenRouter: ${m.id}`,
			provider: 'openrouter',
			model: m.id,
		}))
		allModels.push(...allOrModels)
		openrouterCount = allOrModels.length
		console.log(`✅ OpenRouter: загружено ${openrouterCount} моделей`)
	} catch (err) {
		console.error('❌ Ошибка загрузки моделей OpenRouter:', err.message)
	}

	// 4. Cloudflare
	allModels.push(...CLOUDFLARE_MODELS)
	console.log(`✅ Cloudflare: ${CLOUDFLARE_MODELS.length} статических моделей`)

	// 5. Локальные
	allModels.push(...LOCAL_MODELS)
	console.log(`✅ Локальные: ${LOCAL_MODELS.length} моделей`)

	console.log(`📊 ИТОГО загружено моделей: ${allModels.length}`)

	modelsCache = allModels
	cacheTimestamp = now
	return allModels
}

// ====================== ЭНДПОИНТЫ ======================
app.get('/api/models', async (req, res) => {
	try {
		const models = await fetchAllModels()
		res.json(models)
	} catch (error) {
		console.error(error)
		res.status(500).json({ error: 'Не удалось загрузить список моделей' })
	}
})

app.post('/api/chat', async (req, res) => {
	const { message, modelId, history = [] } = req.body

	const allModels = await fetchAllModels()
	const selectedModel = allModels.find(m => m.id === modelId)
	if (!selectedModel) {
		return res.status(400).json({ error: 'Модель не найдена' })
	}

	let client
	switch (selectedModel.provider) {
		case 'groq':
			client = groqClient
			break
		case 'openrouter':
			client = openrouterClient
			break
		case 'cloudflare':
			client = new OpenAI({
				apiKey: process.env.CF_AIG_TOKEN,
				baseURL: 'https://gateway.ai.cloudflare.com/v1',
			})
			break
		case 'local':
			client = new OpenAI({
				apiKey: process.env.LOCAL_API_KEY || 'sk-no-key-needed',
				baseURL: selectedModel.baseUrl,
			})
			break
		default:
			client = openaiClient
	}

	const messages = [...history.map(m => ({ role: m.role, content: m.content })), { role: 'user', content: message }]

	try {
		const stream = await client.chat.completions.create({
			model: selectedModel.model,
			messages,
			stream: true,
			temperature: 0.7,
		})

		res.setHeader('Content-Type', 'text/event-stream')
		res.setHeader('Cache-Control', 'no-cache')
		res.setHeader('Connection', 'keep-alive')

		for await (const chunk of stream) {
			const content = chunk.choices[0]?.delta?.content || ''
			if (content) res.write(`data: ${content}\n\n`)
		}
		res.write('data: [DONE]\n\n')
		res.end()
	} catch (error) {
		console.error('LLM Error:', error)
		res.status(500).json({ error: error.message })
	}
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
	console.log(`🚀 Бэкенд запущен на http://localhost:${PORT}`)
	console.log('✅ Динамическая загрузка моделей от OpenAI, Groq, OpenRouter, Cloudflare, Local')
})
