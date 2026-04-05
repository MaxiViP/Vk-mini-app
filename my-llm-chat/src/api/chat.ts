const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

export async function sendChatMessage(
	message: string,
	modelId: string,
	history: { role: 'user' | 'assistant'; content: string }[] = [],
) {
	const res = await fetch(`${API_BASE_URL}/api/llm/chat`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ message, modelId, history }),
	})

	if (!res.ok || !res.body) throw new Error('LLM request failed')

	return res.body
}
