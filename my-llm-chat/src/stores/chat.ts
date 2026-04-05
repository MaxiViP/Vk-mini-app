import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { Message, Model, ChatHistoryItem } from '../types'

const STORAGE_KEY = 'chat_history'
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

export const useChatStore = defineStore('chat', () => {
	const messages = ref<Message[]>([])
	const isLoading = ref(false)

	const saved = localStorage.getItem(STORAGE_KEY)
	if (saved) {
		try {
			const parsed = JSON.parse(saved)
			if (Array.isArray(parsed)) messages.value = parsed
		} catch (e) {
			console.error('Ошибка загрузки истории чата', e)
		}
	}

	watch(
		messages,
		newVal => {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(newVal))
		},
		{ deep: true },
	)

	function addSystemMessage(content: string) {
		messages.value.push({
			role: 'assistant',
			content,
			timestamp: Date.now(),
		})
	}

	function addUserMessage(content: string) {
		messages.value.push({
			role: 'user',
			content,
			timestamp: Date.now(),
		})
	}

	function clearHistory() {
		messages.value = []
		localStorage.removeItem(STORAGE_KEY)
	}

	async function sendMessage(text: string, model: Model, history?: ChatHistoryItem[]): Promise<void> {
		isLoading.value = true
		let assistantIndex = -1

		try {
			const response = await fetch(`${API_BASE_URL}/api/llm/chat`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					message: text,
					modelId: model.id,
					history:
						history ??
						messages.value
							.filter(m => m.role === 'user' || m.role === 'assistant')
							.map((m): ChatHistoryItem => ({ role: m.role, content: m.content })),
				}),
			})

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`)
			}

			const reader = response.body?.getReader()
			const decoder = new TextDecoder()
			let assistantMessage = ''

			messages.value.push({
				role: 'assistant',
				content: '',
				timestamp: Date.now(),
			})

			assistantIndex = messages.value.length - 1

			if (!reader) throw new Error('Response body is not readable')

			while (true) {
				const { done, value } = await reader.read()
				if (done) break

				const chunk = decoder.decode(value)
				const lines = chunk.split('\n')

				for (const line of lines) {
					if (!line.startsWith('data: ')) continue
					const data = line.slice(6)
					if (data === '[DONE]') continue
					assistantMessage += data
					const lastMsg = messages.value[messages.value.length - 1]
					if (lastMsg.role === 'assistant') {
						lastMsg.content = assistantMessage
					}
				}
			}
		} catch (err) {
			if (assistantIndex >= 0) {
				messages.value.splice(assistantIndex, 1)
			}
			console.error('LLM error:', err)
			throw err
		} finally {
			isLoading.value = false
		}
	}

	return { messages, isLoading, sendMessage, addSystemMessage, addUserMessage, clearHistory }
})
