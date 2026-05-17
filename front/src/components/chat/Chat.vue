<template>
	<div class="chat">
		<div class="chat-mode-switch">
			<button
				type="button"
				:class="['chat-mode-switch__button', { active: chat.chatMode === 'core' }]"
				@click="switchMode('core')"
			>
				Чат
			</button>
			<button
				type="button"
				:class="['chat-mode-switch__button', { active: chat.chatMode === 'ai' }]"
				@click="switchMode('ai')"
			>
				AI-помощник
			</button>
		</div>

		<div v-if="chat.isAiMode" class="chat-context-bar chat-context-bar--ai">
			<div class="ai-status-head">
				<div class="ai-status-copy">
					<span class="ai-mode-badge">AI-помощник</span>
					<strong class="ai-status-title">{{ aiPlanLabel || 'AI mode' }}</strong>
					<span class="ai-status-subtitle">{{ aiAccessSummary }}</span>
				</div>

				<div class="ai-status">
					<button
						type="button"
						class="context-action_toggle"
						:aria-expanded="isContextPrimaryOpen"
						@click="toggleContextPrimary"
					>
						{{ isContextPrimaryOpen ? '⬆️' : '⬇️' }}
					</button>
					<span :class="['context-status', `context-status--${chat.backendStatus}`]">
						{{ backendStatusLabel }}
					</span>
				</div>
			</div>

			<div v-if="aiLimitItems.length" class="ai-limit-grid">
				<div v-for="item in aiLimitItems" :key="item.label" class="ai-limit-card">
					<span class="ai-limit-card__label">{{ item.label }}</span>
					<strong class="ai-limit-card__value">{{ item.value }}</strong>
				</div>
			</div>

			<div v-if="!aiLimitItems.length" v-show="isContextPrimaryOpen" class="context-primary">
				<span class="context-pill context-pill--highlight">{{ aiAccessSummary }}</span>
			</div>

			<div v-show="isContextPrimaryOpen" class="context-primary">
				<span v-for="pill in aiCapabilityPills" :key="pill" class="context-pill context-pill--highlight">
					{{ pill }}
				</span>
				<span class="context-pill">Сессия: {{ chat.conversationId }}</span>
				<span v-if="chat.contextFiles.length" class="context-pill">
					Файлы: {{ chat.activeContextFiles.length }}/{{ chat.contextFiles.length }}
				</span>
				<span v-if="chat.voiceRecords.length" class="context-pill">
					Аудио: {{ activeVoiceRecords.length }}/{{ chat.voiceRecords.length }}
				</span>
				<span class="context-pill context-pill--muted">{{ chat.backendBaseUrl }}</span>
			</div>

			<div class="context-secondary">
				<button class="context-action" @click="toggleContextPanel">Контекст</button>

				<button
					class="context-action"
					@click="chat.resetConversation"
					:disabled="chat.isLoading || chat.isUploadingFile"
				>
					Сбросить
				</button>
			</div>

			<div v-if="transferStatusItems.length" class="context-chips">
				<span v-for="item in transferStatusItems" :key="item.key" :class="['context-chip', item.className]">
					{{ item.label }}
				</span>
			</div>

			<div v-if="chat.contextFiles.length" class="context-chips">
				<ConfirmDeleteChip
					v-for="file in chat.contextFiles"
					:key="file"
					class="context-chip"
					:label="file"
					title="Файл в контексте"
					@delete="chat.removeContextFile(file)"
				/>
			</div>

			<div v-if="chat.voiceRecords.length" class="context-chips">
				<ConfirmDeleteChip
					v-for="voice in chat.voiceRecords"
					:key="voice"
					class="context-chip context-chip--voice"
					:label="voice"
					title="Аудио в контексте"
					@delete="removeVoiceRecord(voice)"
				/>
			</div>
		</div>

		<div ref="messagesContainerRef" class="messages" @scroll="handleMessagesScroll">
			<div v-if="topSpacerHeight > 0" aria-hidden="true" :style="{ height: `${topSpacerHeight}px` }"></div>

			<div v-for="item in visibleMessages" :key="item.key" :ref="setMessageRowRef(item.index)">
				<Message
					:message="item.message"
					:index="item.index"
					:actions-disabled="chat.isLoading"
					:quick-context-enabled="chat.isAiMode"
					:quick-context-open="quickContextOpenIndex === item.index"
					:quick-context-value="quickContextValue"
					:quick-context-max-length="quickContextMode === 'memory' ? USER_MEMORY_MAX_LENGTH : SESSION_CONTEXT_MAX_LENGTH"
					:quick-context-mode="quickContextMode"
					:quick-context-saving="!isQuickContextListMode && (quickContextSaving || quickMemoryLoading)"
					:user-profile-enabled="chat.isAiMode"
					:user-profile-open="userProfileOpenIndex === item.index"
					:user-profile="quickUserProfile"
					@edit-message="handleEditMessage"
					@resend-message="handleResendMessage"
					@toggle-quick-context="handleQuickContextToggle"
					@switch-quick-context-mode="handleQuickContextModeSwitch"
					@save-quick-context="handleQuickContextSave"
					@close-quick-context="handleQuickContextClose"
					@toggle-user-profile="handleUserProfileToggle"
					@close-user-profile="handleUserProfileClose"
				/>
			</div>

			<div v-if="bottomSpacerHeight > 0" aria-hidden="true" :style="{ height: `${bottomSpacerHeight}px` }"></div>

			<div v-if="chat.isLoading" class="message assistant">
				<div class="avatar avatar--assistant" aria-hidden="true">
					<svg class="avatar__icon avatar__icon--assistant" viewBox="0 0 24 24">
						<rect x="5" y="7" width="14" height="11" rx="4" />
						<path d="M12 3v4" />
						<path d="M8.5 12h.01" />
						<path d="M15.5 12h.01" />
						<path d="M9.5 15.5c1.35 1 3.65 1 5 0" />
						<path d="M4 12h1" />
						<path d="M19 12h1" />
					</svg>
				</div>
				<div :class="['bubble', 'typing-indicator', { 'typing-indicator--ai': chat.isAiMode }]">
					<template v-if="chat.isAiMode">
						<span class="typing-indicator__label">{{ aiTypingLabel }}</span>
						<span class="typing-orbs" aria-hidden="true">
							<i></i>
							<i></i>
							<i></i>
						</span>
					</template>
					<template v-else>
						<span>{{ typingLabel }}</span>
						<span class="dots">...</span>
					</template>
				</div>
			</div>
		</div>

		<ChatInput
			ref="chatInputRef"
			@send="sendWithFallback"
			@stop="stopGeneration"
			@upload-file="uploadFile"
			@voice-recorded="uploadVoice"
			@voice-error="handleVoiceError"
			:disabled="false"
			:uploading="chat.isUploadingFile"
			:is-generating="chat.isLoading"
			:show-file-action="chat.isAiMode"
		/>

		<ChatContextPanel v-model:visible="showContextPanel" />
	</div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { ComponentPublicInstance } from 'vue'

import type { ChatHistoryItem, Message as ChatMessage, Model } from '../../types'
import { fetchAiMemory, saveAiMemory } from '../../api/workspace'
import { HOME_PROMPT_EVENT, HOME_PROMPT_STORAGE_KEY } from '../../data/homeCards'
import { useChatStore } from '../../stores/chat'
import { useModelsStore } from '../../stores/models'
import { useUserStore } from '../../stores/user'
import Message from './Message.vue'
import ChatInput from './ChatInput.vue'
import ConfirmDeleteChip from './ConfirmDeleteChip.vue'

const ChatContextPanel = defineAsyncComponent(() => import('./ChatContextPanel.vue'))

const VIRTUALIZATION_MIN_ITEMS = 40
const DEFAULT_MESSAGE_HEIGHT = 112
const VIRTUALIZATION_BUFFER_PX = 600
const AUTO_SCROLL_THRESHOLD_PX = 48
const SESSION_CONTEXT_MAX_LENGTH = 1200
const USER_MEMORY_MAX_LENGTH = 1200

type QuickContextMode = 'session' | 'memory' | 'files' | 'audio'

type ChatInputExposed = {
	setText: (value: string) => void
}

const chat = useChatStore()
const chatApi = chat as any
const modelsStore = useModelsStore()
const userStore = useUserStore()

const showContextPanel = ref(false)
const isContextPrimaryOpen = ref(false)
const userProfileOpenIndex = ref<number | null>(null)
const quickContextOpenIndex = ref<number | null>(null)
const quickContextMode = ref<QuickContextMode>('session')
const quickContextValue = ref('')
const quickContextSaving = ref(false)
const quickMemoryLoading = ref(false)
const quickMemoryValue = ref('')
const quickMemoryLoadedToken = ref('')
const messagesContainerRef = ref<HTMLElement | null>(null)
const chatInputRef = ref<ChatInputExposed | null>(null)
const scrollTop = ref(0)
const viewportHeight = ref(0)
const isNearBottom = ref(false)
const measuredHeights = ref<Record<number, number>>({})
const messageRowRefs = new Map<number, HTMLElement>()

const isQuickContextListMode = computed(() => quickContextMode.value === 'files' || quickContextMode.value === 'audio')

const voiceRecords = computed<string[]>(() => (Array.isArray(chat.voiceRecords) ? chat.voiceRecords : []))

const selectedVoiceRecords = computed<string[]>(() =>
	Array.isArray(chatApi.selectedVoiceRecords) ? chatApi.selectedVoiceRecords : voiceRecords.value,
)

const activeVoiceRecords = computed<string[]>(() =>
	Array.isArray(chatApi.activeVoiceRecords)
		? chatApi.activeVoiceRecords
		: voiceRecords.value.filter(voice => selectedVoiceRecords.value.includes(voice)),
)

const removeVoiceRecord = (voice: string) => {
	const handler =
		chatApi.removeVoiceRecord ||
		chatApi.removeContextVoice ||
		chatApi.removeVoice ||
		chatApi.removeAudioRecord

	if (typeof handler === 'function') {
		handler.call(chat, voice)
	}
}

const switchMode = (mode: 'core' | 'ai') => {
	void chat.setChatMode(mode)
}

const quickUserProfile = computed(() => ({
	user: userStore.user,
	aiAccess: userStore.aiAccess,
	isAuthenticated: userStore.isAuthenticated,
}))

const handleUserProfileToggle = async ({ index }: { index: number }) => {
	if (index < 0) return

	quickContextOpenIndex.value = null

	if (userProfileOpenIndex.value === index) {
		userProfileOpenIndex.value = null
		await nextTick()
		measureVisibleRows()
		return
	}

	await ensureAiAccessLoaded()
	userProfileOpenIndex.value = index

	await nextTick()
	measureVisibleRows()
}

const handleUserProfileClose = async () => {
	userProfileOpenIndex.value = null
	await nextTick()
	measureVisibleRows()
}

const fallbackExternalModel: Model = {
	id: 'vk-ai-external',
	name: 'VK AI Backend',
	provider: 'local',
	model: 'vk-ai-backend',
}

const backendStatusLabel = computed(() => {
	switch (chat.backendStatus) {
		case 'online':
			return 'VK AI online'
		case 'offline':
			return 'VK AI offline'
		default:
			return 'VK AI checking'
	}
})

const aiAccess = computed(() => userStore.aiAccess)
const isAiSubscriptionActive = computed(() => userStore.isAiSubscriptionActive)
const formatAiCounter = (value?: number | null) => Number(value ?? 0)
const formatShortDate = (value: string) => new Date(value).toLocaleDateString()

const aiPlanLabel = computed(() => (isAiSubscriptionActive.value && aiAccess.value?.plan ? aiAccess.value.plan.name : ''))

const aiAccessSummary = computed(() => {
	if (isAiSubscriptionActive.value && aiAccess.value?.subscription?.expiresAt) {
		return `Доступ до ${formatShortDate(aiAccess.value.subscription.expiresAt)}`
	}

	if (aiAccess.value?.subscription?.status === 'expired') {
		return 'AI-подписка истекла'
	}

	if (aiAccess.value && !aiAccess.value.hasAccess) {
		return 'AI-доступ не активен'
	}

	return 'Проверяем AI-доступ'
})

const aiLimitItems = computed(() => {
	if (!aiAccess.value) return []
	const remaining = isAiSubscriptionActive.value ? aiAccess.value.remaining : { chat: 0, fileUpload: 0, voice: 0 }

	return [
		{ label: 'Чаты', value: formatAiCounter(remaining.chat) },
		{ label: 'Файлы', value: formatAiCounter(remaining.fileUpload) },
		{ label: 'Голос', value: formatAiCounter(remaining.voice) },
	]
})

const aiCapabilityPills = computed(() => {
	if (!aiAccess.value || !isAiSubscriptionActive.value) return []

	const items: string[] = []
	if (aiAccess.value.capabilities.chat) items.push('Чат активен')
	if (aiAccess.value.capabilities.fileUpload) items.push('Файлы доступны')
	if (aiAccess.value.capabilities.voice) items.push('Голос доступен')
	return items
})

const typingLabel = computed(() => 'Модель думает')
const aiTypingLabel = computed(() => (chat.isExternalBackend ? 'AI анализирует контекст' : 'AI готовит ответ'))

const transferStatusItems = computed(() => {
	const items: Array<{ key: string; label: string; className: string }> = []
	const fileStatus = chat.fileTransfer.status
	const voiceStatus = chat.voiceTransfer.status

	if (fileStatus !== 'idle') {
		items.push({
			key: 'file-transfer',
			label:
				fileStatus === 'error'
					? `File error: ${chat.fileTransfer.error}`
					: `File ${fileStatus}: ${chat.fileTransfer.name}`,
			className: fileStatus === 'error' ? 'context-chip--error' : 'context-chip--transfer',
		})
	}

	if (voiceStatus !== 'idle') {
		items.push({
			key: 'voice-transfer',
			label:
				voiceStatus === 'error'
					? `Voice error: ${chat.voiceTransfer.error}`
					: `Voice ${voiceStatus}: ${chat.voiceTransfer.name}`,
			className: voiceStatus === 'error' ? 'context-chip--error' : 'context-chip--voice',
		})
	}

	return items
})

const shouldVirtualize = computed(() => chat.messages.length > VIRTUALIZATION_MIN_ITEMS)

const getMeasuredHeight = (index: number) => measuredHeights.value[index] ?? DEFAULT_MESSAGE_HEIGHT

const getMessageStableKey = (message: ChatMessage, index: number) => {
	const keyedMessage = message as ChatMessage & { id?: string | number }
	return String(keyedMessage.id ?? message.timestamp ?? index)
}

const cumulativeHeights = computed(() => {
	const result = new Array(chat.messages.length + 1).fill(0)

	for (let index = 0; index < chat.messages.length; index += 1) {
		result[index + 1] = result[index] + getMeasuredHeight(index)
	}

	return result
})

const totalMessagesHeight = computed(() => cumulativeHeights.value[cumulativeHeights.value.length - 1] ?? 0)

const findStartIndexByOffset = (targetOffset: number) => {
	const itemCount = chat.messages.length
	if (itemCount === 0) return 0

	const prefixes = cumulativeHeights.value
	let low = 0
	let high = itemCount - 1
	const safeTargetOffset = Math.max(0, targetOffset)

	while (low < high) {
		const mid = Math.floor((low + high) / 2)
		if ((prefixes[mid + 1] ?? 0) >= safeTargetOffset) {
			high = mid
		} else {
			low = mid + 1
		}
	}

	return low
}

const findEndIndexByOffset = (targetOffset: number) => {
	const itemCount = chat.messages.length
	if (itemCount === 0) return 0

	const prefixes = cumulativeHeights.value
	let low = 1
	let high = itemCount
	const safeTargetOffset = Math.max(0, targetOffset)

	while (low < high) {
		const mid = Math.floor((low + high) / 2)
		if ((prefixes[mid] ?? 0) > safeTargetOffset) {
			high = mid
		} else {
			low = mid + 1
		}
	}

	return low
}

const visibleWindow = computed(() => {
	const allMessages = chat.messages

	if (!shouldVirtualize.value) {
		return {
			items: allMessages.map((message, index) => ({
				index,
				key: getMessageStableKey(message, index),
				message,
			})),
			top: 0,
			bottom: 0,
		}
	}

	const windowStart = Math.max(0, scrollTop.value - VIRTUALIZATION_BUFFER_PX)
	const windowEnd = scrollTop.value + viewportHeight.value + VIRTUALIZATION_BUFFER_PX
	const prefixes = cumulativeHeights.value
	const startIndex = findStartIndexByOffset(windowStart)
	const endIndex = Math.min(allMessages.length, Math.max(startIndex + 1, findEndIndexByOffset(windowEnd)))
	const offset = prefixes[startIndex] ?? 0
	const currentOffset = prefixes[endIndex] ?? totalMessagesHeight.value

	return {
		items: allMessages.slice(startIndex, endIndex).map((message, relativeIndex) => {
			const index = startIndex + relativeIndex
			return {
				index,
				key: getMessageStableKey(message, index),
				message,
			}
		}),
		top: offset,
		bottom: Math.max(0, totalMessagesHeight.value - currentOffset),
	}
})

const visibleMessages = computed(() => visibleWindow.value.items)
const topSpacerHeight = computed(() => visibleWindow.value.top)
const bottomSpacerHeight = computed(() => visibleWindow.value.bottom)
const visibleRangeSignature = computed(() => visibleMessages.value.map(item => item.index).join(':'))

const lastMessageSignature = computed(() => {
	const lastMessage = chat.messages[chat.messages.length - 1]
	if (!lastMessage) return ''
	return `${chat.messages.length}:${lastMessage.role}:${lastMessage.content.length}:${lastMessage.timestamp}`
})

const updateViewportMetrics = () => {
	const container = messagesContainerRef.value
	if (!container) return

	scrollTop.value = container.scrollTop
	viewportHeight.value = container.clientHeight
	isNearBottom.value = container.scrollTop + container.clientHeight >= container.scrollHeight - AUTO_SCROLL_THRESHOLD_PX
}

const scrollToBottom = (behavior: ScrollBehavior = 'auto') => {
	const container = messagesContainerRef.value
	if (!container) return

	container.scrollTo({
		top: container.scrollHeight,
		behavior,
	})
}

const measureMessageRowHeight = (row: HTMLElement) => {
	const measuredElement = (row.firstElementChild as HTMLElement | null) || row
	const styles = window.getComputedStyle(measuredElement)
	const marginTop = Number.parseFloat(styles.marginTop) || 0
	const marginBottom = Number.parseFloat(styles.marginBottom) || 0
	return measuredElement.offsetHeight + marginTop + marginBottom
}

const measureVisibleRows = () => {
	if (!messageRowRefs.size) {
		updateViewportMetrics()
		return
	}

	const nextHeights = { ...measuredHeights.value }
	let hasChanges = false

	for (const [index, row] of messageRowRefs.entries()) {
		const nextHeight = measureMessageRowHeight(row)
		if (nextHeight > 0 && nextHeights[index] !== nextHeight) {
			nextHeights[index] = nextHeight
			hasChanges = true
		}
	}

	if (hasChanges) {
		measuredHeights.value = nextHeights
	}

	updateViewportMetrics()
}

const setMessageRowRef = (index: number) => (element: Element | ComponentPublicInstance | null) => {
	if (element instanceof HTMLElement) {
		messageRowRefs.set(index, element)
		return
	}

	messageRowRefs.delete(index)
}

const handleMessagesScroll = () => {
	updateViewportMetrics()
}

const ensureAiAccessLoaded = async () => {
	if (!chat.isAiMode || !userStore.isAuthenticated || userStore.aiAccess) return

	try {
		await userStore.loadAiAccess()
	} catch (error) {
		console.warn('AI access load failed', error)
	}
}

const emitChatContextState = () => {
	window.dispatchEvent(
		new CustomEvent('chat-context-state', {
			detail: { open: showContextPanel.value },
		}),
	)
}

const toggleContextPanel = () => {
	showContextPanel.value = !showContextPanel.value
}

const toggleContextPrimary = () => {
	isContextPrimaryOpen.value = !isContextPrimaryOpen.value
}

const handleToggleChatContext = (event: Event) => {
	const customEvent = event as CustomEvent<{ open?: boolean }>
	if (typeof customEvent.detail?.open === 'boolean') {
		showContextPanel.value = customEvent.detail.open
		return
	}

	showContextPanel.value = !showContextPanel.value
}

const consumePendingHomePrompt = async () => {
	const prompt = localStorage.getItem(HOME_PROMPT_STORAGE_KEY)
	if (!prompt) return

	localStorage.removeItem(HOME_PROMPT_STORAGE_KEY)
	await nextTick()
	chatInputRef.value?.setText(prompt)
}

const normalizeQuickSessionContext = (value: string) => String(value || '').slice(0, SESSION_CONTEXT_MAX_LENGTH).trim()
const normalizeQuickUserMemory = (value: string) => String(value || '').slice(0, USER_MEMORY_MAX_LENGTH).trim()

const loadQuickSessionContext = () => normalizeQuickSessionContext(chat.readSessionContext(userStore.user?.vkId, chat.conversationId))

const loadQuickUserMemory = async (force = false) => {
	if (!userStore.token) {
		quickMemoryValue.value = ''
		quickMemoryLoadedToken.value = ''
		return ''
	}

	if (!force && quickMemoryLoadedToken.value === userStore.token) {
		return quickMemoryValue.value
	}

	quickMemoryLoading.value = true
	try {
		const payload = await fetchAiMemory(userStore.token)
		const normalized = normalizeQuickUserMemory(payload.aiMemory || '')
		quickMemoryValue.value = normalized
		quickMemoryLoadedToken.value = userStore.token
		return normalized
	} catch (error) {
		console.warn('Failed to load quick AI memory', error)
		return quickMemoryValue.value
	} finally {
		quickMemoryLoading.value = false
	}
}

const loadQuickContextValue = async (mode: QuickContextMode) => {
	if (mode === 'files' || mode === 'audio') return ''
	return mode === 'memory' ? loadQuickUserMemory() : loadQuickSessionContext()
}

type QuickContextPayload = {
	index: number
	content?: string
	mode?: QuickContextMode
}

const handleQuickContextToggle = async ({ index }: QuickContextPayload) => {
	if (!chat.isAiMode || index < 0) return

	if (quickContextOpenIndex.value === index) {
		quickContextOpenIndex.value = null
		await nextTick()
		measureVisibleRows()
		return
	}

	const mode = quickContextMode.value
	quickContextValue.value = mode === 'memory' ? quickMemoryValue.value : mode === 'files' || mode === 'audio' ? '' : loadQuickSessionContext()
	quickContextOpenIndex.value = index
	quickContextValue.value = await loadQuickContextValue(mode)

	await nextTick()
	measureVisibleRows()
}

const handleQuickContextModeSwitch = async ({ index, mode }: { index: number; mode: QuickContextMode }) => {
	if (!chat.isAiMode || quickContextOpenIndex.value !== index) return

	quickContextMode.value = mode
	quickContextValue.value = mode === 'memory' ? quickMemoryValue.value : mode === 'files' || mode === 'audio' ? '' : loadQuickSessionContext()
	quickContextValue.value = await loadQuickContextValue(mode)

	await nextTick()
	measureVisibleRows()
}

const saveQuickUserMemory = async (content: string) => {
	if (!userStore.token) {
		chat.addSystemMessage('Чтобы сохранить память AI, войдите в аккаунт.')
		return
	}

	quickContextSaving.value = true
	try {
		const normalized = normalizeQuickUserMemory(content)
		const payload = await saveAiMemory(userStore.token, normalized)
		const saved = normalizeQuickUserMemory(payload.aiMemory || '')
		quickMemoryValue.value = saved
		quickMemoryLoadedToken.value = userStore.token
		quickContextValue.value = saved
		quickContextOpenIndex.value = null

		window.dispatchEvent(
			new CustomEvent('ai-memory-updated', {
				detail: {
					length: saved.length,
				},
			}),
		)
	} catch (error) {
		console.warn('Failed to save quick AI memory', error)
		chat.addSystemMessage(`Не удалось сохранить память AI: ${(error as Error).message}`)
	} finally {
		quickContextSaving.value = false
	}
}

const handleQuickContextSave = async ({ content = '', mode = quickContextMode.value }: QuickContextPayload) => {
	if (!chat.isAiMode) return
	if (mode === 'files' || mode === 'audio') return

	if (mode === 'memory') {
		await saveQuickUserMemory(content)
		await nextTick()
		measureVisibleRows()
		return
	}

	const normalized = normalizeQuickSessionContext(content)
	chat.writeSessionContext(normalized, userStore.user?.vkId, chat.conversationId)
	quickContextValue.value = normalized
	quickContextOpenIndex.value = null

	window.dispatchEvent(
		new CustomEvent('ai-session-context-updated', {
			detail: {
				conversationId: chat.conversationId,
				length: normalized.length,
			},
		}),
	)

	await nextTick()
	measureVisibleRows()
}

const handleQuickContextClose = async () => {
	quickContextOpenIndex.value = null
	await nextTick()
	measureVisibleRows()
}

const isBillingOrAccessError = (message: string) => {
	const normalized = message.toLowerCase()
	return (
		normalized.includes('insufficient balance') ||
		normalized.includes('forbidden') ||
		normalized.includes('auth') ||
		normalized.includes('unauthorized') ||
		normalized.includes('invalid token') ||
		normalized.includes('expired') ||
		normalized.includes('database is unavailable') ||
		normalized.includes('database unavailable') ||
		normalized.includes('база данных') ||
		normalized.includes('сессия')
	)
}

function stopGeneration() {
	chat.abortRequest()
}

type MessageActionPayload = {
	index: number
	content: string
}

type DispatchMessageOptions = {
	appendUserMessage?: boolean
	history?: ChatHistoryItem[]
}

const toChatHistoryItem = (message: ChatMessage): ChatHistoryItem => ({
	role: message.role,
	content: message.content,
})

const getHistoryBeforeIndex = (index: number) => chat.messages.slice(0, Math.max(index, 0)).map(toChatHistoryItem)

async function sendWithFallback(messageText: string, options: DispatchMessageOptions = {}) {
	if (chat.isLoading) return

	const appendUserMessage = options.appendUserMessage !== false

	if (chat.isExternalBackend) {
		if (appendUserMessage) chat.addUserMessage(messageText)
		try {
			await chat.sendMessage(
				messageText,
				fallbackExternalModel,
				options.history ?? chat.messages.map(toChatHistoryItem),
			)
		} catch (error) {
			const typedError = error as Error

			if (typedError.name === 'AbortError') {
				console.info('Генерация остановлена пользователем')
				return
			}

			chat.addSystemMessage(`VK AI backend недоступен: ${typedError.message}`)
		}
		return
	}

	const currentModel = modelsStore.getCurrentModel()
	if (!currentModel) return

	const allModels = modelsStore.models
	const startIndex = allModels.findIndex(model => model.id === currentModel.id)
	const orderedModels = [...allModels.slice(startIndex), ...allModels.slice(0, startIndex)]

	const baseHistory = options.history ?? chat.messages.map(toChatHistoryItem)
	if (appendUserMessage) chat.addUserMessage(messageText)

	let lastError: Error | null = null

	for (const model of orderedModels) {
		try {
			await chat.sendMessage(messageText, model, baseHistory)
			if (model.id !== currentModel.id) {
				modelsStore.selectModel(model.id)
				console.log(`Переключились на рабочую модель: ${model.name}`)
			}
			return
		} catch (error) {
			const typedError = error as Error

			if (typedError.name === 'AbortError') {
				console.info('Генерация остановлена пользователем')
				return
			}

			if (isBillingOrAccessError(typedError.message)) {
				chat.addSystemMessage(typedError.message)
				return
			}

			console.warn(`Модель ${model.name} не ответила:`, error)
			lastError = typedError
		}
	}

	chat.addSystemMessage(`Не удалось получить ответ. Последняя ошибка: ${lastError?.message}`)
}

async function handleEditMessage(payload: MessageActionPayload) {
	if (chat.isLoading || payload.index < 0 || !payload.content.trim()) return

	const history = getHistoryBeforeIndex(payload.index)
	if (!chat.updateMessageContent(payload.index, payload.content)) return

	await sendWithFallback(payload.content, {
		appendUserMessage: false,
		history,
	})
}

async function handleResendMessage(payload: MessageActionPayload) {
	if (chat.isLoading || !payload.content.trim()) return
	await sendWithFallback(payload.content, { appendUserMessage: true })
}

async function uploadFile(file: File) {
	try {
		await chat.uploadContextFile(file)
	} catch (error) {
		chat.addSystemMessage(`Не удалось загрузить файл: ${(error as Error).message}`)
	}
}

async function uploadVoice(file: File) {
	try {
		await chat.sendVoiceMessage(file)
	} catch (error) {
		chat.addSystemMessage(`Не удалось отправить голосовое: ${(error as Error).message}`)
	}
}

function handleVoiceError(message: string) {
	chat.addSystemMessage(`Голосовой ввод недоступен: ${message}`)
}

watch(showContextPanel, emitChatContextState, { immediate: true })

watch(
	() => chat.isAiMode,
	isAiMode => {
		if (!isAiMode) {
			isContextPrimaryOpen.value = false
			quickContextOpenIndex.value = null
			userProfileOpenIndex.value = null
		}
	},
)

watch(
	() => `${userStore.user?.vkId || 'guest'}:${chat.conversationId}`,
	() => {
		quickContextOpenIndex.value = null
		quickContextValue.value = isQuickContextListMode.value ? '' : loadQuickSessionContext()
	},
)

watch(
	() => [chat.isAiMode, userStore.isAuthenticated] as const,
	() => {
		void ensureAiAccessLoaded()
	},
	{ immediate: true },
)

watch(
	() => chat.chatMode,
	() => {
		messageRowRefs.clear()
		measuredHeights.value = {}
	},
)

watch(
	() => visibleRangeSignature.value,
	async () => {
		await nextTick()
		measureVisibleRows()
	},
	{ flush: 'post' },
)

watch(
	() => [chat.messages.length, lastMessageSignature.value, chat.isLoading] as const,
	async () => {
		const shouldStickToBottom = isNearBottom.value
		await nextTick()
		measureVisibleRows()
		if (shouldStickToBottom) {
			scrollToBottom()
			updateViewportMetrics()
		}
	},
	{ flush: 'post' },
)

onMounted(() => {
	window.addEventListener('toggle-chat-context', handleToggleChatContext as EventListener)
	window.addEventListener(HOME_PROMPT_EVENT, consumePendingHomePrompt)
	void consumePendingHomePrompt()
	void nextTick().then(() => {
		measureVisibleRows()
	})
})

onUnmounted(() => {
	window.removeEventListener('toggle-chat-context', handleToggleChatContext as EventListener)
	window.removeEventListener(HOME_PROMPT_EVENT, consumePendingHomePrompt)
	messageRowRefs.clear()
})
</script>
