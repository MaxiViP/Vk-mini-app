import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

import type { Message, Model, ChatHistoryItem } from '../types'
import { fetchWorkspace, saveChatHistory } from '../api/workspace'
import { useUserStore } from './user'

const STORAGE_KEY_PREFIX = 'chat_history'
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

const toHistoryItem = (message: Message): ChatHistoryItem => ({ role: message.role, content: message.content })

const getStorageKey = (userId?: string) => `${STORAGE_KEY_PREFIX}:${userId || 'guest'}`

export const useChatStore = defineStore('chat', () => {
	const userStore = useUserStore()
	const messages = ref<Message[]>([])
	const isLoading = ref(false)
	const isHydrating = ref(false)
	let saveTimer: number | null = null

	const hydrateFromLocalStorage = (userId?: string) => {
		const saved = localStorage.getItem(getStorageKey(userId))
		if (!saved) {
			messages.value = []
			return
		}

		try {
			const parsed = JSON.parse(saved)
			if (Array.isArray(parsed)) {
				messages.value = parsed
					.filter(
						item => item && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string',
					)
					.map(item => ({
						role: item.role,
						content: item.content,
						timestamp: Number(item.timestamp) || Date.now(),
					}))
			}
		} catch (e) {
			console.error('Ошибка загрузки истории чата из localStorage', e)
			messages.value = []
		}
	}

	const syncWithServer = async () => {
		if (!userStore.token || !userStore.user?.vkId) return

		isHydrating.value = true
		try {
			const workspace = await fetchWorkspace(userStore.token)
			messages.value = workspace.chatHistory
			localStorage.setItem(getStorageKey(userStore.user.vkId), JSON.stringify(workspace.chatHistory))
		} catch (error) {
			console.warn('Не удалось загрузить историю чата из БД, используем localStorage', error)
			hydrateFromLocalStorage(userStore.user.vkId)
		} finally {
			isHydrating.value = false
		}
	}

	const schedulePersist = () => {
		const userId = userStore.user?.vkId
		localStorage.setItem(getStorageKey(userId), JSON.stringify(messages.value))

		if (!userStore.token || !userId || isHydrating.value) return

		if (saveTimer) window.clearTimeout(saveTimer)
		saveTimer = window.setTimeout(async () => {
			try {
				await saveChatHistory(userStore.token!, messages.value)
			} catch (error) {
				console.error('Ошибка сохранения истории чата в БД', error)
			}
		}, 500)
	}

	watch(messages, schedulePersist, { deep: true })

	watch(
		() => userStore.user?.vkId,
		async userId => {
			if (!userId) {
				hydrateFromLocalStorage(undefined)
				return
			}
			hydrateFromLocalStorage(userId)
			await syncWithServer()
		},
		{ immediate: true },
	)

	watch(
		() => userStore.token,
		async token => {
			if (token && userStore.user?.vkId) {
				await syncWithServer()
			}
		},
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
		localStorage.removeItem(getStorageKey(userStore.user?.vkId))
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
					history: history ?? messages.value.map(toHistoryItem),
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

	return { messages, isLoading, sendMessage, addSystemMessage, addUserMessage, clearHistory, syncWithServer }
})
