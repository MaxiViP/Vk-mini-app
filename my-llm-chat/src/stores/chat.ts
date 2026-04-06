import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

import type { Message, Model, ChatHistoryItem } from '../types'
import { fetchWorkspace, saveChatHistory, type WorkspaceMessage } from '../api/workspace'
import { useUserStore } from './user'

const STORAGE_KEY_PREFIX = 'chat_history'
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

const toHistoryItem = (message: Message): ChatHistoryItem => ({ role: message.role, content: message.content })
const toWorkspaceMessage = (message: Message): WorkspaceMessage => ({
	role: message.role,
	content: message.content,
	timestamp: Number(message.timestamp) || Date.now(),
})

const getStorageKey = (userId?: string) => `${STORAGE_KEY_PREFIX}:${userId || 'guest'}`

const isLikelyJwt = (token?: string | null) => Boolean(token && token.split('.').length === 3)

export const useChatStore = defineStore('chat', () => {
	const userStore = useUserStore()
	const messages = ref<Message[]>([])
	const isLoading = ref(false)
	const isHydrating = ref(false)
	let saveTimer: number | null = null

	const hydrateFromLocalStorage = (userId?: string) => {
		const key = getStorageKey(userId)
		const saved = localStorage.getItem(key)
		console.log('[chat] hydrateFromLocalStorage:start', { key, hasSaved: Boolean(saved) })

		if (!saved) {
			messages.value = []
			console.log('[chat] hydrateFromLocalStorage:empty')
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
				console.log('[chat] hydrateFromLocalStorage:success', { count: messages.value.length })
			}
		} catch (e) {
			console.error('[chat] hydrateFromLocalStorage:error', e)
			messages.value = []
		}
	}

	const syncWithServer = async () => {
		if (!userStore.token || !isLikelyJwt(userStore.token) || !userStore.user?.vkId) {
			console.log('[chat] syncWithServer:skipped', {
				hasToken: Boolean(userStore.token),
				isLikelyJwt: isLikelyJwt(userStore.token),
				userId: userStore.user?.vkId || null,
			})
			return
		}

		console.log('[chat] syncWithServer:start', { userId: userStore.user.vkId })
		isHydrating.value = true
		try {
			const localSnapshot = [...messages.value]
			const workspace = await fetchWorkspace(userStore.token)
			const serverMessages = Array.isArray(workspace.chatHistory)
				? workspace.chatHistory.map(item => ({
						role: item.role,
						content: item.content,
						timestamp: Number(item.timestamp) || Date.now(),
					}))
				: []

			if (serverMessages.length === 0 && localSnapshot.length > 0) {
				console.log('[chat] syncWithServer:server_empty_use_local', { localCount: localSnapshot.length })
				messages.value = localSnapshot
				await saveChatHistory(userStore.token, localSnapshot.map(toWorkspaceMessage))
			} else {
				messages.value = serverMessages
			}

			localStorage.setItem(getStorageKey(userStore.user.vkId), JSON.stringify(messages.value))
			console.log('[chat] syncWithServer:success', { count: messages.value.length })
		} catch (error) {
			console.warn('[chat] syncWithServer:fallback_to_localStorage', error)
			hydrateFromLocalStorage(userStore.user.vkId)
		} finally {
			isHydrating.value = false
		}
	}

	const schedulePersist = () => {
		const userId = userStore.user?.vkId
		if (isHydrating.value) {
			console.log('[chat] schedulePersist:skipped_hydrating')
			return
		}
		const key = getStorageKey(userId)
		localStorage.setItem(key, JSON.stringify(messages.value))
		console.log('[chat] schedulePersist:local_saved', { key, count: messages.value.length })

		if (!userStore.token || !isLikelyJwt(userStore.token) || !userId) {
			console.log('[chat] schedulePersist:server_skipped', {
				hasToken: Boolean(userStore.token),
				isLikelyJwt: isLikelyJwt(userStore.token),
				userId,
			})
			return
		}

		if (saveTimer) window.clearTimeout(saveTimer)
		saveTimer = window.setTimeout(async () => {
			try {
				const payload = messages.value.map(toWorkspaceMessage)
				console.log('[chat] schedulePersist:server_save:start', { count: payload.length })
				await saveChatHistory(userStore.token!, payload)
				console.log('[chat] schedulePersist:server_save:success')
			} catch (error) {
				console.error('[chat] schedulePersist:server_save:error', error)
			}
		}, 500)
	}

	watch(messages, schedulePersist, { deep: true })

	watch(
		() => userStore.user?.vkId,
		async userId => {
			console.log('[chat] watch:userId', { userId })
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
			console.log('[chat] watch:token', { hasToken: Boolean(token) })
			if (token && isLikelyJwt(token) && userStore.user?.vkId) {
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
		console.log('[chat] clearHistory:done', { userId: userStore.user?.vkId || null })
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
