const sanitizeEnv = value => (typeof value === 'string' ? value.trim().replace(/^['"]|['"]$/g, '') : '')

const GITHUB_TOKEN = sanitizeEnv(process.env.GITHUB_MODELS_TOKEN)
const BASE_URL = 'https://models.github.ai/inference/chat/completions'

const normalizeUsage = usage => ({
	prompt_tokens: Number(usage?.prompt_tokens || 0),
	completion_tokens: Number(usage?.completion_tokens || 0),
	total_tokens: Number(usage?.total_tokens || 0),
})

export const githubModelsClient = {
	chat: {
		completions: {
			async create({ model, messages, temperature = 0.7, max_tokens = 1000 }) {
				if (!GITHUB_TOKEN) {
					throw new Error('GitHub Models is not configured: set GITHUB_MODELS_TOKEN')
				}

				if (typeof fetch !== 'function') {
					throw new Error('Global fetch is not available in this Node.js runtime')
				}

				const response = await fetch(BASE_URL, {
					method: 'POST',
					headers: {
						Authorization: `Bearer ${GITHUB_TOKEN}`,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						model,
						messages,
						temperature,
						max_tokens,
					}),
				})

				if (!response.ok) {
					const text = await response.text()
					throw new Error(`GitHub Models error: ${response.status} ${text}`)
				}

				const data = await response.json()

				return {
					id: data.id || null,
					object: data.object || 'chat.completion',
					created: data.created || Math.floor(Date.now() / 1000),
					model: data.model || model,
					choices: Array.isArray(data.choices) ? data.choices : [],
					usage: normalizeUsage(data.usage),
				}
			},
		},
	},
}
