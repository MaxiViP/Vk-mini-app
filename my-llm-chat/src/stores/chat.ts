import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import type { Message, Model, ChatHistoryItem, MessageMeta, SourceHistoryItem } from '../types'
import { fetchWorkspace, saveChatHistory, type WorkspaceMessage } from '../api/workspace'
import { vkAiApi } from '../api/vkAi'
import { internalApiBaseUrl, isVkAiBackend, vkAiApiBaseUrl } from '../config/chatBackend'
import { useUserStore } from './user'

const STORAGE_KEY_PREFIX = 'chat_history'
const CONVERSATION_STORAGE_KEY = 'vk_ai_conversation_id'

const toHistoryItem = (message: Message): ChatHistoryItem => ({ role: message.role, content: message.content })
const toWorkspaceMessage = (message: Message): WorkspaceMessage => ({
	role: message.role,
	content: message.content,
	timestamp: Number(message.timestamp) || Date.now(),
})

const getStorageKey = (userId?: string) => `${STORAGE_KEY_PREFIX}:${userId || 'guest'}`
const isLikelyJwt = (token?: string | null) => Boolean(token && token.split('.').length === 3)

const normalizeMeta = (meta: unknown): MessageMeta | undefined => {
	if (!meta || typeof meta !== 'object') return undefined
	const value = meta as Record<string, unknown>
	return {
		sourceType: typeof value.sourceType === 'string' ? value.sourceType : undefined,
		sources: Array.isArray(value.sources)
			? value.sources
					.filter(item => item && typeof item === 'object')
					.map(item => ({
						type: String((item as Record<string, unknown>).type || 'source'),
						name: String((item as Record<string, unknown>).name || 'unknown'),
					}))
			: undefined,
		transcript: typeof value.transcript === 'string' ? value.transcript : undefined,
		audioReplyUrl: typeof value.audioReplyUrl === 'string' ? value.audioReplyUrl : undefined,
		fileName: typeof value.fileName === 'string' ? value.fileName : undefined,
		statusLabel: typeof value.statusLabel === 'string' ? value.statusLabel : undefined,
	}
}

const normalizeStoredMessages = (parsed: unknown): Message[] => {
	if (!Array.isArray(parsed)) return []

	return parsed
		.filter(item => item && typeof item === 'object')
		.map(item => item as Record<string, unknown>)
		.filter(item => (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string')
		.map(item => ({
			role: item.role as 'user' | 'assistant',
			content: item.content as string,
			timestamp: Number(item.timestamp) || Date.now(),
			meta: normalizeMeta(item.meta),
		}))
}

const createConversationId = (userId?: string) => {
	const safeUserId = userId || 'guest'
	return `vk-dialog-${safeUserId}`
}

export const useChatStore = defineStore('chat', () => {
	const userStore = useUserStore()
	const messages = ref<Message[]>([])
	const isLoading = ref(false)
	const isHydrating = ref(false)
	const isUploadingFile = ref(false)
	const backendStatus = ref<'idle' | 'online' | 'offline'>('idle')
	const conversationId = ref(localStorage.getItem(CONVERSATION_STORAGE_KEY) || createConversationId())
	const contextFiles = ref<string[]>([])
	const voiceRecords = ref<string[]>([])
	const sourceHistory = ref<SourceHistoryItem[]>([])
	let saveTimer: number | null = null

	const isExternalBackend = computed(() => isVkAiBackend)
	const backendLabel = computed(() => (isExternalBackend.value ? 'VK AI backend' : 'Internal LLM backend'))
	const backendBaseUrl = computed(() => (isExternalBackend.value ? vkAiApiBaseUrl : internalApiBaseUrl))

	const setConversationId = (userId?: string) => {
		const nextId = createConversationId(userId)
		conversationId.value = nextId
		localStorage.setItem(CONVERSATION_STORAGE_KEY, nextId)
	}

	const pushSourceHistory = (payload: { sourceType?: string; sources?: MessageMeta['sources']; replyPreview: string; transcript?: string }) => {
		if ((!payload.sources || payload.sources.length === 0) && !payload.sourceType) return

		sourceHistory.value.unshift({
			id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
			timestamp: Date.now(),
			sourceType: payload.sourceType,
			sources: payload.sources || [],
			replyPreview: payload.replyPreview.slice(0, 180),
			transcript: payload.transcript,
		})
		sourceHistory.value = sourceHistory.value.slice(0, 20)
	}

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
			messages.value = normalizeStoredMessages(JSON.parse(saved))
			console.log('[chat] hydrateFromLocalStorage:success', { count: messages.value.length })
		} catch (e) {
			console.error('[chat] hydrateFromLocalStorage:error', e)
			messages.value = []
		}
	}

	const refreshExternalHealth = async () => {
		if (!isExternalBackend.value) {
			backendStatus.value = 'idle'
			return
		}

		try {
			await vkAiApi.health()
			backendStatus.value = 'online'
		} catch (error) {
			console.warn('[chat] vk-ai health failed', error)
			backendStatus.value = 'offline'
		}
	}

	const hydrateExternalConversation = async () => {
		const userId = userStore.user?.vkId || 'guest'
		setConversationId(userId)
		isHydrating.value = true

		try {
			await refreshExternalHealth()
			const conversation = await vkAiApi.getConversation({
				userId,
				conversationId: conversationId.value,
			})

			messages.value = conversation.messages.map(item => ({
				role: item.role,
				content: item.content,
				timestamp: Date.now(),
			}))
			contextFiles.value = Array.isArray(conversation.files) ? conversation.files : []
			voiceRecords.value = Array.isArray(conversation.voice_records) ? conversation.voice_records : []
			localStorage.setItem(getStorageKey(userId), JSON.stringify(messages.value))
			backendStatus.value = 'online'
		} catch (error) {
			console.warn('[chat] hydrateExternalConversation:fallback_to_local', error)
			hydrateFromLocalStorage(userId)
			backendStatus.value = 'offline'
		} finally {
			isHydrating.value = false
		}
	}

	const syncWithServer = async () => {
		if (isExternalBackend.value) {
			await hydrateExternalConversation()
			return
		}

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

		if (isExternalBackend.value) {
			return
		}

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
			setConversationId(userId)
			contextFiles.value = []
			voiceRecords.value = []
			sourceHistory.value = []

			if (!userId) {
				hydrateFromLocalStorage(undefined)
				if (isExternalBackend.value) {
					await hydrateExternalConversation()
				}
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
			if (isExternalBackend.value) {
				await refreshExternalHealth()
				return
			}
			if (token && isLikelyJwt(token) && userStore.user?.vkId) {
				await syncWithServer()
			}
		},
	)

	function addSystemMessage(content: string, meta?: MessageMeta) {
		messages.value.push({
			role: 'assistant',
			content,
			timestamp: Date.now(),
			meta,
		})
	}

	function addUserMessage(content: string, meta?: MessageMeta) {
		messages.value.push({
			role: 'user',
			content,
			timestamp: Date.now(),
			meta,
		})
	}

	async function uploadContextFile(file: File) {
		if (!isExternalBackend.value) {
			throw new Error('File context upload is available only for VK AI backend mode')
		}

		const userId = userStore.user?.vkId || 'guest'
		isUploadingFile.value = true

		try {
			const result = await vkAiApi.uploadFile({
				userId,
				conversationId: conversationId.value,
				file,
			})
			contextFiles.value = Array.from(new Set([...contextFiles.value, result.filename]))
			addUserMessage(`Файл "${result.filename}" добавлен в контекст`, {
				fileName: result.filename,
				statusLabel: `Обработано: ${result.status}`,
			})
			backendStatus.value = 'online'
		} catch (error) {
			backendStatus.value = 'offline'
			throw error
		} finally {
			isUploadingFile.value = false
		}
	}

	async function resetConversation() {
		const userId = userStore.user?.vkId || 'guest'

		if (isExternalBackend.value) {
			await vkAiApi.resetConversation({
				userId,
				conversationId: conversationId.value,
			})
			backendStatus.value = 'online'
		}

		messages.value = []
		contextFiles.value = []
		voiceRecords.value = []
		sourceHistory.value = []
		localStorage.removeItem(getStorageKey(userId))
	}

	async function sendVoiceMessage(audio: File) {
		if (!isExternalBackend.value) {
			throw new Error('Voice is available only for VK AI backend mode')
		}

		const userId = userStore.user?.vkId || 'guest'
		isLoading.value = true

		try {
			const response = await vkAiApi.sendVoice({
				userId,
				conversationId: conversationId.value,
				audio,
			})

			voiceRecords.value = Array.from(new Set([...voiceRecords.value, audio.name]))
			addUserMessage(response.transcript || 'Голосовое сообщение', {
				transcript: response.transcript,
				statusLabel: 'Voice message',
			})
			addSystemMessage(response.reply, {
				sourceType: response.source_type,
				sources: response.sources,
				transcript: response.transcript,
				audioReplyUrl: response.audio_reply_url,
			})
			pushSourceHistory({
				sourceType: response.source_type,
				sources: response.sources,
				replyPreview: response.reply,
				transcript: response.transcript,
			})
			backendStatus.value = 'online'
		} catch (error) {
			backendStatus.value = 'offline'
			throw error
		} finally {
			isLoading.value = false
		}
	}

	async function sendMessage(text: string, model: Model | null, history?: ChatHistoryItem[]): Promise<void> {
		isLoading.value = true
		let assistantIndex = -1

		try {
			if (isExternalBackend.value) {
				const userId = userStore.user?.vkId || 'guest'
				const response = await vkAiApi.chat({
					userId,
					conversationId: conversationId.value,
					message: text,
				})

				addSystemMessage(response.reply, {
					sourceType: response.source_type,
					sources: response.sources,
					transcript: response.transcript,
					audioReplyUrl: response.audio_reply_url,
				})
				pushSourceHistory({
					sourceType: response.source_type,
					sources: response.sources,
					replyPreview: response.reply,
					transcript: response.transcript,
				})
				backendStatus.value = 'online'
				return
			}

			if (!model) {
				throw new Error('Model is required')
			}

			const response = await fetch(`${internalApiBaseUrl}/api/llm/chat`, {
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
			if (!isExternalBackend.value && assistantIndex >= 0) {
				messages.value.splice(assistantIndex, 1)
			}
			console.error('LLM error:', err)
			throw err
		} finally {
			isLoading.value = false
		}
	}

	return {
		messages,
		isLoading,
		isHydrating,
		isUploadingFile,
		isExternalBackend,
		backendStatus,
		backendLabel,
		backendBaseUrl,
		conversationId,
		contextFiles,
		voiceRecords,
		sourceHistory,
		sendMessage,
		sendVoiceMessage,
		addSystemMessage,
		addUserMessage,
		clearHistory: resetConversation,
		syncWithServer,
		resetConversation,
		uploadContextFile,
		refreshExternalHealth,
	}
})
