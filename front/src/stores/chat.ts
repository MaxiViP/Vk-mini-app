import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import type { Message, Model, ChatHistoryItem, MessageMeta, SourceHistoryItem } from '../types'
import { fetchWorkspace, saveChatHistory, type WorkspaceMessage } from '../api/workspace'
import { getVkAiErrorCode, vkAiApi } from '../api/vkAi'
import { internalApiBaseUrl, vkAiChatMode } from '../config/chatBackend'
import { shouldUseAiApi } from '../domain/chatModeRules'
import { isDevSessionRefreshToken, useUserStore } from './user'

const STORAGE_KEY_PREFIX = 'chat_history'
const CONVERSATION_STORAGE_KEY = 'vk_ai_conversation_id'
const CHAT_MODE_STORAGE_KEY = 'chat_mode'
const AI_SESSION_CONTEXT_KEY_PREFIX = 'ai:context'
const AI_SESSION_CONTEXT_MAX_LENGTH = 1200
const LOCAL_PERSIST_DEBOUNCE_MS = 300
const SERVER_PERSIST_DEBOUNCE_MS = 500

const EXTERNAL_AI_BUSINESS_CODES = new Set([
	'AI_SUBSCRIPTION_REQUIRED',
	'AI_SUBSCRIPTION_EXPIRED',
	'AI_LIMIT_REACHED',
	'AI_FEATURE_DISABLED',
	'AI_BACKEND_UNAVAILABLE',
	'AI_FILE_TOO_LARGE',
	'AI_FILE_TYPE_UNSUPPORTED',
	'AI_AUDIO_TOO_LARGE',
	'AI_AUDIO_TYPE_UNSUPPORTED',
])

const toHistoryItem = (message: Message): ChatHistoryItem => ({ role: message.role, content: message.content })
const toWorkspaceMessage = (message: Message): WorkspaceMessage => ({
	role: message.role,
	content: message.content,
	timestamp: Number(message.timestamp) || Date.now(),
})

type ChatMode = 'core' | 'ai'
type TransferState = {
	status: 'idle' | 'uploading' | 'recording' | 'sending' | 'success' | 'error'
	name: string
	error: string
}

const createTransferState = (): TransferState => ({
	status: 'idle',
	name: '',
	error: '',
})

const getStorageKey = (userId?: string, mode: ChatMode = 'core') => `${STORAGE_KEY_PREFIX}:${mode}:${userId || 'guest'}`
const getAiSessionContextStorageKey = (userId?: string, conversationId?: string) =>
	`${AI_SESSION_CONTEXT_KEY_PREFIX}:${userId || 'guest'}:${conversationId || createConversationId(userId)}`
const isLikelyJwt = (token?: string | null) => Boolean(token && token.split('.').length === 3)
const normalizeSessionContext = (value: string) => String(value || '').slice(0, AI_SESSION_CONTEXT_MAX_LENGTH)

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

const toExternalAiError = (error: unknown) => {
	const code = getVkAiErrorCode(error)
	const status = (error as { status?: number })?.status || null
	const message = (error as Error)?.message || 'VK AI backend недоступен'

	switch (code) {
		case 'AI_SUBSCRIPTION_REQUIRED':
			return new Error('Для AI-чата нужна активная AI-подписка.')
		case 'AI_SUBSCRIPTION_EXPIRED':
			return new Error('AI-подписка истекла.')
		case 'AI_LIMIT_REACHED':
			return new Error('Лимит AI-запросов исчерпан.')
		case 'AI_FEATURE_DISABLED':
			return new Error('Эта AI-функция недоступна на текущем тарифе.')
		case 'AI_BACKEND_UNAVAILABLE':
			return new Error('VK AI backend временно недоступен.')
		case 'AI_BACKEND_AUTH_FAILED':
			return new Error('VK AI backend auth failed. Check server API key.')
		case 'AI_FILE_TOO_LARGE':
			return new Error('File is too large for AI upload.')
		case 'AI_FILE_TYPE_UNSUPPORTED':
			return new Error('File type is not supported for AI upload.')
		case 'AI_AUDIO_TOO_LARGE':
			return new Error('Voice message is too large.')
		case 'AI_AUDIO_TYPE_UNSUPPORTED':
			return new Error('Voice message type is not supported.')
		default:
			if (status === 401) return new Error('Требуется авторизация.')
			return new Error(message)
	}
}

const shouldKeepExternalBackendOnline = (error: unknown) => {
	const code = getVkAiErrorCode(error)
	return code ? EXTERNAL_AI_BUSINESS_CODES.has(code) && code !== 'AI_BACKEND_UNAVAILABLE' : false
}

export const useChatStore = defineStore('chat', () => {
	const userStore = useUserStore()
	const coreMessages = ref<Message[]>([])
	const aiMessages = ref<Message[]>([])
	const isLoading = ref(false)
	const isHydrating = ref(false)
	const isUploadingFile = ref(false)
	const fileTransfer = ref<TransferState>(createTransferState())
	const voiceTransfer = ref<TransferState>(createTransferState())
	const backendStatus = ref<'idle' | 'online' | 'offline'>('idle')
	const chatMode = ref<ChatMode>(localStorage.getItem(CHAT_MODE_STORAGE_KEY) === 'ai' ? 'ai' : 'core')
	const conversationId = ref(localStorage.getItem(CONVERSATION_STORAGE_KEY) || createConversationId())
	const contextFiles = ref<string[]>([])
	const selectedContextFiles = ref<string[]>([])
	const voiceRecords = ref<string[]>([])
	const sourceHistory = ref<SourceHistoryItem[]>([])
	let localPersistTimer: number | null = null
	let serverSaveTimer: number | null = null
	let abortController: AbortController | null = null

	const messages = computed<Message[]>({
		get: () => (chatMode.value === 'ai' ? aiMessages.value : coreMessages.value),
		set: value => {
			if (chatMode.value === 'ai') {
				aiMessages.value = value
				return
			}
			coreMessages.value = value
		},
	})
	const isAiMode = computed(() => chatMode.value === 'ai')
	const isExternalBackend = computed(() => shouldUseAiApi(chatMode.value))
	const backendLabel = computed(() => (isAiMode.value ? 'VK AI backend' : 'Internal LLM backend'))
	const backendBaseUrl = computed(() => internalApiBaseUrl || window.location.origin)
	const activeContextFiles = computed(() => {
		const selected = new Set(selectedContextFiles.value)
		return contextFiles.value.filter(fileName => selected.has(fileName))
	})

	const normalizeContextFileList = (files: string[]) => files.map(fileName => String(fileName || '').trim()).filter(Boolean)

	const syncSelectedContextFiles = (files = contextFiles.value, previousFiles?: string[]) => {
		const normalizedFiles = normalizeContextFileList(files)
		const previous = previousFiles ? new Set(normalizeContextFileList(previousFiles)) : null
		const existingFiles = new Set(normalizedFiles)
		const selected = new Set(selectedContextFiles.value.filter(fileName => existingFiles.has(fileName)))

		for (const fileName of normalizedFiles) {
			if (!previous || !previous.has(fileName)) selected.add(fileName)
		}

		selectedContextFiles.value = normalizedFiles.filter(fileName => selected.has(fileName))
	}

	const setStoredChatMode = (mode: ChatMode) => {
		chatMode.value = mode
		localStorage.setItem(CHAT_MODE_STORAGE_KEY, mode)
	}

	const setModeMessages = (mode: ChatMode, nextMessages: Message[]) => {
		if (mode === 'ai') {
			aiMessages.value = nextMessages
			return
		}
		coreMessages.value = nextMessages
	}

	const getModeMessages = (mode: ChatMode) => (mode === 'ai' ? aiMessages.value : coreMessages.value)

	const clearPersistTimers = () => {
		if (localPersistTimer) {
			window.clearTimeout(localPersistTimer)
			localPersistTimer = null
		}

		if (serverSaveTimer) {
			window.clearTimeout(serverSaveTimer)
			serverSaveTimer = null
		}
	}

	const scheduleLocalPersist = (mode: ChatMode, userId?: string) => {
		if (localPersistTimer) window.clearTimeout(localPersistTimer)

		localPersistTimer = window.setTimeout(() => {
			const key = getStorageKey(userId, mode)
			localStorage.setItem(key, JSON.stringify(getModeMessages(mode)))
			console.log('[chat] schedulePersist:local_saved', {
				key,
				mode,
				count: getModeMessages(mode).length,
			})
			localPersistTimer = null
		}, LOCAL_PERSIST_DEBOUNCE_MS)
	}

	const getExternalAccessToken = () => {
		if (!userStore.token || !isLikelyJwt(userStore.token)) {
			throw new Error('Требуется авторизация.')
		}
		return userStore.token
	}

	const setConversationId = (userId?: string) => {
		const nextId = createConversationId(userId)
		conversationId.value = nextId
		localStorage.setItem(CONVERSATION_STORAGE_KEY, nextId)
	}

	const readSessionContext = (userId = userStore.user?.vkId, currentConversationId = conversationId.value) => {
		try {
			return normalizeSessionContext(localStorage.getItem(getAiSessionContextStorageKey(userId, currentConversationId)) || '')
		} catch {
			return ''
		}
	}

	const writeSessionContext = (value: string, userId = userStore.user?.vkId, currentConversationId = conversationId.value) => {
		const key = getAiSessionContextStorageKey(userId, currentConversationId)
		const normalized = normalizeSessionContext(value).trim()

		try {
			if (!normalized) {
				localStorage.removeItem(key)
				return
			}

			localStorage.setItem(key, normalized)
		} catch {
			// ignore localStorage failures
		}
	}

	const pushSourceHistory = (payload: {
		sourceType?: string
		sources?: MessageMeta['sources']
		replyPreview: string
		transcript?: string
	}) => {
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

	const hydrateFromLocalStorage = (userId?: string, mode: ChatMode = chatMode.value) => {
		const key = getStorageKey(userId, mode)
		const saved = localStorage.getItem(key)
		console.log('[chat] hydrateFromLocalStorage:start', { key, mode, hasSaved: Boolean(saved) })

		if (!saved) {
			setModeMessages(mode, [])
			console.log('[chat] hydrateFromLocalStorage:empty')
			return
		}

		try {
			const normalized = normalizeStoredMessages(JSON.parse(saved))
			setModeMessages(mode, normalized)
			console.log('[chat] hydrateFromLocalStorage:success', { mode, count: normalized.length })
		} catch (e) {
			console.error('[chat] hydrateFromLocalStorage:error', e)
			setModeMessages(mode, [])
		}
	}

	const refreshExternalHealth = async () => {
		if (!isExternalBackend.value) {
			backendStatus.value = 'idle'
			return null
		}

		if (!userStore.token || !isLikelyJwt(userStore.token)) {
			backendStatus.value = 'idle'
			return null
		}

		try {
			const health = await vkAiApi.health(getExternalAccessToken())
			backendStatus.value = 'online'
			return health
		} catch (error) {
			if (shouldKeepExternalBackendOnline(error)) {
				backendStatus.value = 'online'
				return null
			}

			console.warn('[chat] vk-ai health failed', error)
			backendStatus.value = 'offline'
			return null
		}
	}

	const refreshAiAccessAfterExternalError = async (error: unknown) => {
		const code = getVkAiErrorCode(error)
		if (!code || !EXTERNAL_AI_BUSINESS_CODES.has(code)) return

		try {
			await userStore.loadAiAccess()
		} catch (accessError) {
			console.warn('[chat] ai access refresh after external error failed', accessError)
		}
	}

	const hydrateExternalConversation = async () => {
		const userId = userStore.user?.vkId || 'guest'
		setConversationId(userId)
		isHydrating.value = true

		if (!userStore.token || !isLikelyJwt(userStore.token)) {
			setModeMessages('ai', [])
			contextFiles.value = []
			selectedContextFiles.value = []
			voiceRecords.value = []
			backendStatus.value = 'idle'
			isHydrating.value = false
			return
		}

		try {
			await refreshExternalHealth()
			const conversation = await vkAiApi.getConversation({
				accessToken: getExternalAccessToken(),
				conversationId: conversationId.value,
			})

			const nextMessages = conversation.messages.map(item => ({
				role: item.role,
				content: item.content,
				timestamp: Date.now(),
			}))
			setModeMessages('ai', nextMessages)
			contextFiles.value = Array.isArray(conversation.files) ? conversation.files : []
			syncSelectedContextFiles()
			voiceRecords.value = Array.isArray(conversation.voice_records) ? conversation.voice_records : []
			localStorage.setItem(getStorageKey(userId, 'ai'), JSON.stringify(nextMessages))
			backendStatus.value = 'online'
		} catch (error) {
			console.warn('[chat] hydrateExternalConversation:external_failed', error)
			await refreshAiAccessAfterExternalError(error)
			setModeMessages('ai', [])
			contextFiles.value = []
			selectedContextFiles.value = []
			voiceRecords.value = []
			backendStatus.value = shouldKeepExternalBackendOnline(error) ? 'online' : 'offline'
		} finally {
			isHydrating.value = false
		}
	}

	const syncCoreWithServer = async () => {
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
			const localSnapshot = [...coreMessages.value]
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
				coreMessages.value = localSnapshot
				await saveChatHistory(userStore.token, localSnapshot.map(toWorkspaceMessage))
			} else {
				coreMessages.value = serverMessages
			}

			localStorage.setItem(getStorageKey(userStore.user.vkId, 'core'), JSON.stringify(coreMessages.value))
			console.log('[chat] syncWithServer:success', { count: coreMessages.value.length })
		} catch (error) {
			console.warn('[chat] syncWithServer:fallback_to_localStorage', error)
			hydrateFromLocalStorage(userStore.user.vkId, 'core')
		} finally {
			isHydrating.value = false
		}
	}

	const syncWithServer = async () => {
		if (isAiMode.value) {
			await hydrateExternalConversation()
			return
		}

		await syncCoreWithServer()
	}

	const schedulePersist = () => {
		const userId = userStore.user?.vkId
		const mode = chatMode.value
		if (isHydrating.value) {
			console.log('[chat] schedulePersist:skipped_hydrating')
			return
		}

		scheduleLocalPersist(mode, userId)

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

		if (serverSaveTimer) window.clearTimeout(serverSaveTimer)
		serverSaveTimer = window.setTimeout(async () => {
			try {
				const payload = getModeMessages(mode).map(toWorkspaceMessage)
				console.log('[chat] schedulePersist:server_save:start', { count: payload.length })
				await saveChatHistory(userStore.token!, payload)
				console.log('[chat] schedulePersist:server_save:success')
			} catch (error) {
				console.error('[chat] schedulePersist:server_save:error', error)
			} finally {
				serverSaveTimer = null
			}
		}, SERVER_PERSIST_DEBOUNCE_MS)
	}

	watch(messages, schedulePersist, { deep: true })
	watch(contextFiles, (files, previousFiles) => syncSelectedContextFiles(files, previousFiles))

	watch(
		() => userStore.user?.vkId,
		async userId => {
			console.log('[chat] watch:userId', { userId })
			clearPersistTimers()
			setConversationId(userId)
			contextFiles.value = []
			selectedContextFiles.value = []
			voiceRecords.value = []
			sourceHistory.value = []
			fileTransfer.value = createTransferState()
			voiceTransfer.value = createTransferState()

			if (!userId) {
				if (isExternalBackend.value) {
					await hydrateExternalConversation()
				} else {
					hydrateFromLocalStorage(undefined, chatMode.value)
				}
				return
			}

			if (!isExternalBackend.value) {
				hydrateFromLocalStorage(userId, chatMode.value)
			}
			await syncWithServer()
		},
		{ immediate: true },
	)

	watch(
		() => userStore.token,
		async token => {
			console.log('[chat] watch:token', { hasToken: Boolean(token) })
			if (isExternalBackend.value) {
				await syncWithServer()
				return
			}
			if (token && isLikelyJwt(token) && userStore.user?.vkId) {
				await syncWithServer()
			}
		},
	)

	const setChatMode = async (mode: ChatMode) => {
		if (chatMode.value === mode) return
		clearPersistTimers()
		setStoredChatMode(mode)
		await syncWithServer()
	}

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

	function updateMessageContent(index: number, content: string) {
		const target = messages.value[index]
		if (!target || !content.trim()) return false

		target.content = content.trim()
		target.timestamp = Date.now()
		return true
	}

	function abortRequest() {
		abortController?.abort()
		abortController = null
		isLoading.value = false
	}

	async function uploadContextFile(file: File) {
		if (!isExternalBackend.value) {
			throw new Error('File context upload is available only for VK AI backend mode')
		}

		isUploadingFile.value = true
		fileTransfer.value = {
			status: 'uploading',
			name: file.name,
			error: '',
		}

		try {
			const result = await vkAiApi.uploadFile({
				accessToken: getExternalAccessToken(),
				conversationId: conversationId.value,
				file,
			})
			const fileName = result.filename || file.name
			contextFiles.value = Array.from(new Set([...contextFiles.value, fileName]))
			selectedContextFiles.value = Array.from(new Set([...selectedContextFiles.value, fileName]))
			fileTransfer.value = {
				status: 'success',
				name: fileName,
				error: '',
			}
			addUserMessage(`Файл "${fileName}" добавлен в контекст`, {
				fileName,
				statusLabel: result.status ? `Обработано: ${result.status}` : 'Загружено',
			})
			backendStatus.value = 'online'
			await userStore.loadAiAccess()
		} catch (error) {
			backendStatus.value = shouldKeepExternalBackendOnline(error) ? 'online' : 'offline'
			await refreshAiAccessAfterExternalError(error)
			const externalError = toExternalAiError(error)
			fileTransfer.value = {
				status: 'error',
				name: file.name,
				error: externalError.message,
			}
			throw externalError
		} finally {
			isUploadingFile.value = false
		}
	}

	function removeContextFile(fileName: string) {
		const normalized = String(fileName || '').trim()
		if (!normalized) return

		const nextFiles = contextFiles.value.filter(name => name !== normalized)
		if (nextFiles.length === contextFiles.value.length) return

		contextFiles.value = nextFiles
		selectedContextFiles.value = selectedContextFiles.value.filter(name => name !== normalized)

		if (fileTransfer.value.status === 'success' && fileTransfer.value.name === normalized) {
			fileTransfer.value = createTransferState()
		}
	}

	function setContextFileSelected(fileName: string, selected: boolean) {
		const normalized = String(fileName || '').trim()
		if (!normalized || !contextFiles.value.includes(normalized)) return

		if (selected) {
			selectedContextFiles.value = Array.from(new Set([...selectedContextFiles.value, normalized]))
			return
		}

		selectedContextFiles.value = selectedContextFiles.value.filter(name => name !== normalized)
	}

	async function resetConversation() {
		const userId = userStore.user?.vkId || 'guest'
		clearPersistTimers()

		if (isExternalBackend.value) {
			try {
				await vkAiApi.resetConversation({
					accessToken: getExternalAccessToken(),
					conversationId: conversationId.value,
				})
				backendStatus.value = 'online'
			} catch (error) {
				backendStatus.value = shouldKeepExternalBackendOnline(error) ? 'online' : 'offline'
				await refreshAiAccessAfterExternalError(error)
				throw toExternalAiError(error)
			}
		}

		messages.value = []
		contextFiles.value = []
		selectedContextFiles.value = []
		voiceRecords.value = []
		sourceHistory.value = []
		fileTransfer.value = createTransferState()
		voiceTransfer.value = createTransferState()
		localStorage.removeItem(getStorageKey(userId, chatMode.value))
	}

	async function sendVoiceMessage(audio: File) {
		if (!isExternalBackend.value) {
			throw new Error('Voice is available only for VK AI backend mode')
		}

		isLoading.value = true
		voiceTransfer.value = {
			status: 'sending',
			name: audio.name,
			error: '',
		}

		try {
			const response = await vkAiApi.sendVoice({
				accessToken: getExternalAccessToken(),
				conversationId: conversationId.value,
				audio,
			})

			voiceRecords.value = Array.from(new Set([...voiceRecords.value, audio.name]))
			voiceTransfer.value = {
				status: 'success',
				name: audio.name,
				error: '',
			}
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
			await userStore.loadAiAccess()
		} catch (error) {
			backendStatus.value = shouldKeepExternalBackendOnline(error) ? 'online' : 'offline'
			await refreshAiAccessAfterExternalError(error)
			const externalError = toExternalAiError(error)
			voiceTransfer.value = {
				status: 'error',
				name: audio.name,
				error: externalError.message,
			}
			throw externalError
		} finally {
			isLoading.value = false
		}
	}

	async function sendMessage(text: string, model: Model | null, history?: ChatHistoryItem[]): Promise<void> {
		isLoading.value = true
		let assistantIndex = -1

		try {
			if (isExternalBackend.value) {
				const sessionContext = readSessionContext().trim()
				const hasSessionContext = Boolean(sessionContext)
				const hasSelectedFiles = activeContextFiles.value.length > 0
				const hasExternalContext = hasSelectedFiles || voiceRecords.value.length > 0

				const response = await vkAiApi.chat({
					accessToken: getExternalAccessToken(),
					conversationId: conversationId.value,
					message: text,
					sessionContext: hasSessionContext ? sessionContext : undefined,
					selectedFiles: contextFiles.value.length ? activeContextFiles.value : undefined,
					mode: hasSessionContext || hasExternalContext ? 'context' : 'simple',
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
				await userStore.loadAiAccess()
				return
			}

			if (!model) {
				throw new Error('Model is required')
			}

			if (!userStore.token || !isLikelyJwt(userStore.token)) {
				throw new Error('Требуется авторизация')
			}

			abortController = new AbortController()
			const requestId = `chat_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
			const requestBody = JSON.stringify({
				message: text,
				modelId: model.id,
				history: history ?? messages.value.map(toHistoryItem),
			})
			const executeChatRequest = () =>
				fetch(`${internalApiBaseUrl}/api/llm/chat`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${userStore.token}`,
						'X-Request-Id': requestId,
					},
					body: requestBody,
					signal: abortController.signal,
				})

			let response = await executeChatRequest()

			if (response.status === 401 && userStore.refreshToken && !isDevSessionRefreshToken(userStore.refreshToken)) {
				try {
					await userStore.refreshAuth()
					response = await executeChatRequest()
				} catch (refreshError) {
					console.warn('Token refresh before chat retry failed', refreshError)
					throw new Error('Сессия истекла или backend не смог обновить токен. Проверьте авторизацию и БД.')
				}
			}

			if (!response.ok) {
				let errorMessage = `HTTP ${response.status}: ${response.statusText}`
				try {
					const payload = await response.json()
					if (payload?.message) {
						errorMessage = payload.message
					}
				} catch {
					// ignore non-json error bodies
				}
				if (response.status === 401) {
					errorMessage = 'Сессия истекла или токен невалиден. Войдите заново.'
				}
				throw new Error(errorMessage)
			}

			const reader = response.body?.getReader()
			const decoder = new TextDecoder()
			let assistantMessage = ''
			let streamBuffer = ''

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

				streamBuffer += decoder.decode(value, { stream: true })
				const lines = streamBuffer.split('\n')
				streamBuffer = lines.pop() || ''

				for (const line of lines) {
					if (!line.startsWith('data: ')) continue
					const data = line.slice(6)
					if (data === '[DONE]') continue

					let nextChunk = data
					try {
						const parsed = JSON.parse(data) as { content?: string }
						nextChunk = typeof parsed.content === 'string' ? parsed.content : data
					} catch {
						// backward-compatible with legacy plain-text SSE chunks
					}

					assistantMessage += nextChunk

					const lastMsg = messages.value[messages.value.length - 1]
					if (lastMsg && lastMsg.role === 'assistant') {
						lastMsg.content = assistantMessage
					}
				}
			}

			const tail = streamBuffer.trim()
			if (tail.startsWith('data: ')) {
				const data = tail.slice(6)
				if (data && data !== '[DONE]') {
					let nextChunk = data
					try {
						const parsed = JSON.parse(data) as { content?: string }
						nextChunk = typeof parsed.content === 'string' ? parsed.content : data
					} catch {
						// backward-compatible with legacy plain-text SSE chunks
					}

					assistantMessage += nextChunk
					const lastMsg = messages.value[messages.value.length - 1]
					if (lastMsg && lastMsg.role === 'assistant') {
						lastMsg.content = assistantMessage
					}
				}
			}

			await userStore.refreshBillingState()
		} catch (err) {
			if (!isExternalBackend.value && assistantIndex >= 0) {
				messages.value.splice(assistantIndex, 1)
			}

			if ((err as Error).name === 'AbortError') {
				throw err
			}

			if (isExternalBackend.value) {
				await refreshAiAccessAfterExternalError(err)
				throw toExternalAiError(err)
			}

			console.error('LLM error:', err)
			throw err
		} finally {
			isLoading.value = false
			abortController = null
		}
	}

	return {
		chatMode,
		messages,
		isLoading,
		isHydrating,
		isUploadingFile,
		fileTransfer,
		voiceTransfer,
		isAiMode,
		isExternalBackend,
		backendStatus,
		backendLabel,
		backendBaseUrl,
		conversationId,
		contextFiles,
		selectedContextFiles,
		activeContextFiles,
		voiceRecords,
		sourceHistory,
		readSessionContext,
		writeSessionContext,
		sendMessage,
		abortRequest,
		sendVoiceMessage,
		addSystemMessage,
		addUserMessage,
		updateMessageContent,
		setChatMode,
		clearHistory: resetConversation,
		syncWithServer,
		resetConversation,
		uploadContextFile,
		removeContextFile,
		setContextFileSelected,
		refreshExternalHealth,
	}
})
