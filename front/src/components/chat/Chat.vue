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
				<span v-for="pill in aiCapabilityPills" :key="pill" class="context-pill context-pill--highlight">{{
					pill
				}}</span>
				<span class="context-pill">Сессия: {{ chat.conversationId }}</span>
				<span v-if="chat.contextFiles.length" class="context-pill">Файлы: {{ chat.contextFiles.length }}</span>
				<span v-if="chat.voiceRecords.length" class="context-pill">Голос: {{ chat.voiceRecords.length }}</span>
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
				<span v-for="file in chat.contextFiles" :key="file" class="context-chip">Файл: {{ file }}</span>
			</div>

			<div v-if="chat.voiceRecords.length" class="context-chips">
				<span v-for="voice in chat.voiceRecords" :key="voice" class="context-chip context-chip--voice">
					Voice: {{ voice }}
				</span>
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
					:quick-context-max-length="SESSION_CONTEXT_MAX_LENGTH"
					@edit-message="handleEditMessage"
					@resend-message="handleResendMessage"
					@toggle-quick-context="handleQuickContextToggle"
					@save-quick-context="handleQuickContextSave"
					@close-quick-context="handleQuickContextClose"
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
import { useChatStore } from '../../stores/chat'
import { useModelsStore } from '../../stores/models'
import { useUserStore } from '../../stores/user'
import Message from './Message.vue'
import ChatInput from './ChatInput.vue'

const ChatContextPanel = defineAsyncComponent(() => import('./ChatContextPanel.vue'))
const VIRTUALIZATION_MIN_ITEMS = 40
const DEFAULT_MESSAGE_HEIGHT = 112
const VIRTUALIZATION_BUFFER_PX = 600
const AUTO_SCROLL_THRESHOLD_PX = 48
const SESSION_CONTEXT_MAX_LENGTH = 1200

const chat = useChatStore()
const modelsStore = useModelsStore()
const userStore = useUserStore()
const showContextPanel = ref(false)
const isContextPrimaryOpen = ref(false)
const quickContextOpenIndex = ref<number | null>(null)
const quickContextValue = ref('')
const messagesContainerRef = ref<HTMLElement | null>(null)
const scrollTop = ref(0)
const viewportHeight = ref(0)
const isNearBottom = ref(false)
const measuredHeights = ref<Record<number, number>>({})
const messageRowRefs = new Map<number, HTMLElement>()

const switchMode = (mode: 'core' | 'ai') => {
	void chat.setChatMode(mode)
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
const formatAiCounter = (value?: number | null) => Number(value ?? 0)
const formatShortDate = (value: string) => new Date(value).toLocaleDateString()

const aiPlanLabel = computed(() => (aiAccess.value?.hasAccess && aiAccess.value.plan ? aiAccess.value.plan.name : ''))

const aiAccessSummary = computed(() => {
	if (aiAccess.value?.hasAccess && aiAccess.value.subscription?.expiresAt) {
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

	return [
		{ label: 'Чаты', value: formatAiCounter(aiAccess.value.remaining.chat) },
		{ label: 'Файлы', value: formatAiCounter(aiAccess.value.remaining.fileUpload) },
		{ label: 'Голос', value: formatAiCounter(aiAccess.value.remaining.voice) },
	]
})

const aiCapabilityPills = computed(() => {
	if (!aiAccess.value) return []

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

const normalizeQuickSessionContext = (value: string) => String(value || '').slice(0, SESSION_CONTEXT_MAX_LENGTH).trim()

const loadQuickSessionContext = () => normalizeQuickSessionContext(chat.readSessionContext(userStore.user?.vkId, chat.conversationId))

type QuickContextPayload = {
	index: number
	content?: string
}

const handleQuickContextToggle = async ({ index }: QuickContextPayload) => {
	if (!chat.isAiMode || index < 0) return

	if (quickContextOpenIndex.value === index) {
		quickContextOpenIndex.value = null
		await nextTick()
		measureVisibleRows()
		return
	}

	quickContextValue.value = loadQuickSessionContext()
	quickContextOpenIndex.value = index
	await nextTick()
	measureVisibleRows()
}

const handleQuickContextSave = async ({ content = '' }: QuickContextPayload) => {
	if (!chat.isAiMode) return

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
		}
	},
)

watch(
	() => `${userStore.user?.vkId || 'guest'}:${chat.conversationId}`,
	() => {
		quickContextOpenIndex.value = null
		quickContextValue.value = loadQuickSessionContext()
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
	void nextTick().then(() => {
		measureVisibleRows()
	})
})

onUnmounted(() => {
	window.removeEventListener('toggle-chat-context', handleToggleChatContext as EventListener)
	messageRowRefs.clear()
})
</script>
