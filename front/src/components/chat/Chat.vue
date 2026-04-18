<template>
	<div :class="['chat', { 'chat--ai': chat.isAiMode }]">
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

				<span :class="['context-status', `context-status--${chat.backendStatus}`]">
					{{ backendStatusLabel }}
				</span>
			</div>

			<div v-if="aiLimitItems.length" class="ai-limit-grid">
				<div v-for="item in aiLimitItems" :key="item.label" class="ai-limit-card">
					<span class="ai-limit-card__label">{{ item.label }}</span>
					<strong class="ai-limit-card__value">{{ item.value }}</strong>
				</div>
			</div>

			<div v-if="!aiLimitItems.length" class="context-primary">
				<span class="context-pill context-pill--highlight">{{ aiAccessSummary }}</span>
			</div>

			<div class="context-primary">
				<span v-for="pill in aiCapabilityPills" :key="pill" class="context-pill context-pill--highlight">{{ pill }}</span>
				<span class="context-pill">Сессия: {{ chat.conversationId }}</span>
				<span v-if="chat.contextFiles.length" class="context-pill">Файлы: {{ chat.contextFiles.length }}</span>
				<span v-if="chat.voiceRecords.length" class="context-pill">Голос: {{ chat.voiceRecords.length }}</span>
				<span class="context-pill context-pill--muted">{{ chat.backendBaseUrl }}</span>
			</div>

			<div class="context-secondary">
				<button
					class="context-action"
					@click="chat.resetConversation"
					:disabled="chat.isLoading || chat.isUploadingFile"
				>
					Сбросить контекст
				</button>
				<button class="context-action" @click="toggleContextPanel">Открыть панель контекста</button>
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
				<Message :message="item.message" />
			</div>
			<div v-if="bottomSpacerHeight > 0" aria-hidden="true" :style="{ height: `${bottomSpacerHeight}px` }"></div>
			<div v-if="chat.isLoading" class="message assistant typing">
				<div class="avatar">🤖</div>
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

import type { Message as ChatMessage, Model } from '../../types'
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

const chat = useChatStore()
const modelsStore = useModelsStore()
const userStore = useUserStore()
const showContextPanel = ref(false)
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
	isNearBottom.value =
		container.scrollTop + container.clientHeight >= container.scrollHeight - AUTO_SCROLL_THRESHOLD_PX
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

const handleToggleChatContext = (event: Event) => {
	const customEvent = event as CustomEvent<{ open?: boolean }>
	if (typeof customEvent.detail?.open === 'boolean') {
		showContextPanel.value = customEvent.detail.open
		return
	}
	showContextPanel.value = !showContextPanel.value
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

async function sendWithFallback(messageText: string) {
	if (chat.isLoading) return

	if (chat.isExternalBackend) {
		chat.addUserMessage(messageText)
		try {
			await chat.sendMessage(
				messageText,
				fallbackExternalModel,
				chat.messages.map(m => ({ role: m.role, content: m.content })),
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

	const baseHistory = chat.messages.map(message => ({ role: message.role, content: message.content }))
	chat.addUserMessage(messageText)

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

<style scoped>
.chat {
	position: relative;
	display: flex;
	flex-direction: column;
	height: 100%;
	gap: 12px;
}

.chat-mode-switch {
	display: inline-flex;
	gap: 8px;
	max-width: var(--content-width);
	width: 100%;
	margin: 0 auto;
}

.chat-mode-switch__button {
	border: 1px solid rgba(255, 255, 255, 0.1);
	background: rgba(255, 255, 255, 0.04);
	color: var(--color-text-soft);
	padding: 10px 14px;
	border-radius: 999px;
	cursor: pointer;
	font-weight: 600;
	transition:
		background var(--transition-base),
		border-color var(--transition-base),
		color var(--transition-base),
		box-shadow var(--transition-base),
		transform var(--transition-fast);
}

.chat-mode-switch__button:hover {
	transform: translateY(-1px);
}

.chat-mode-switch__button.active {
	background: var(--mode-accent-soft);
	border-color: var(--mode-accent-border);
	color: var(--mode-accent-strong);
	box-shadow: 0 0 0 1px var(--mode-accent-soft), 0 12px 30px rgba(0, 0, 0, 0.16);
}

.chat-context-bar {
	display: flex;
	flex-direction: column;
	gap: 10px;
	max-width: var(--content-width);
	width: 100%;
	margin: 0 auto;
	padding: 12px 14px;
	border: 1px solid rgba(255, 255, 255, 0.08);
	border-radius: 18px;
	background: var(--mode-panel-bg);
	box-sizing: border-box;
}

.chat-context-bar--ai {
	min-height: 182px;
	border-color: var(--mode-accent-border);
	background:
		linear-gradient(180deg, rgba(255, 255, 255, 0.02), transparent),
		var(--mode-panel-bg-strong);
	box-shadow:
		0 0 0 1px rgba(255, 255, 255, 0.02),
		0 18px 40px rgba(0, 0, 0, 0.18);
}

.ai-status-head {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 12px;
}

.ai-status-copy {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-width: 0;
}

.ai-mode-badge {
	display: inline-flex;
	align-items: center;
	width: fit-content;
	padding: 5px 9px;
	border-radius: 999px;
	background: var(--mode-accent-soft);
	border: 1px solid var(--mode-accent-border);
	color: var(--mode-accent-strong);
	font-size: 11px;
	font-weight: 700;
	letter-spacing: 0.04em;
	text-transform: uppercase;
}

.ai-status-title {
	font-size: 15px;
	line-height: 1.3;
	color: var(--color-text);
}

.ai-status-subtitle {
	font-size: 13px;
	color: var(--color-text-soft);
}

.ai-limit-grid {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 8px;
}

.ai-limit-card {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	border-radius: 14px;
	background: rgba(255, 255, 255, 0.04);
	border: 1px solid rgba(255, 255, 255, 0.06);
}

.ai-limit-card__label {
	font-size: 11px;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	color: var(--color-text-muted);
}

.ai-limit-card__value {
	font-size: 20px;
	line-height: 1;
	color: var(--mode-accent-strong);
}

.context-primary,
.context-secondary,
.context-chips {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	align-items: center;
}

.context-status,
.context-pill,
.context-chip {
	display: inline-flex;
	align-items: center;
	padding: 6px 10px;
	border-radius: 999px;
	font-size: 12px;
	line-height: 1.2;
}

.context-status {
	font-weight: 700;
}

.context-status--online {
	background: var(--mode-accent-soft);
	color: var(--mode-accent-strong);
}

.context-status--offline {
	background: rgba(255, 107, 107, 0.14);
	color: #ff9b9b;
}

.context-status--idle {
	background: rgba(255, 255, 255, 0.08);
	color: #d7d7d7;
}

.context-pill,
.context-chip {
	background: rgba(255, 255, 255, 0.06);
	color: var(--color-text-soft);
	border: 1px solid rgba(255, 255, 255, 0.04);
}

.context-pill--highlight {
	background: var(--mode-accent-soft);
	color: var(--mode-accent-strong);
	border-color: var(--mode-accent-border);
}

.context-pill--muted {
	max-width: 100%;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.context-chip--voice {
	background: var(--mode-accent-soft);
	color: var(--mode-accent-strong);
	border-color: var(--mode-accent-border);
}

.context-action {
	border: 1px solid rgba(255, 255, 255, 0.12);
	background: rgba(255, 255, 255, 0.04);
	color: var(--color-text);
	padding: 8px 12px;
	border-radius: 999px;
	cursor: pointer;
	transition:
		border-color var(--transition-base),
		background var(--transition-base),
		transform var(--transition-fast);
}

.context-action:hover:not(:disabled) {
	transform: translateY(-1px);
	border-color: var(--mode-accent-border);
	background: var(--mode-accent-soft);
}

.context-action:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.chat-scroll-down {
	align-self: center;
	flex-shrink: 0;
}

.typing-indicator {
	background: #343541;
	padding: 10px 14px;
	border-radius: 18px 18px 18px 4px;
	display: flex;
	align-items: center;
	gap: 4px;
}

.typing-indicator--ai {
	background:
		linear-gradient(135deg, rgba(255, 255, 255, 0.04), transparent),
		var(--mode-accent-soft);
	border: 1px solid var(--mode-accent-border);
	box-shadow: 0 12px 30px rgba(0, 0, 0, 0.18);
	gap: 10px;
}

.typing-indicator__label {
	color: var(--mode-accent-strong);
	font-weight: 600;
}

.typing-orbs {
	display: inline-flex;
	align-items: center;
	gap: 6px;
}

.typing-orbs i {
	width: 8px;
	height: 8px;
	border-radius: 50%;
	background: var(--mode-accent);
	box-shadow: 0 0 12px var(--mode-accent-glow);
	animation: aiPulse 1.1s infinite ease-in-out;
}

.typing-orbs i:nth-child(2) {
	animation-delay: 0.16s;
}

.typing-orbs i:nth-child(3) {
	animation-delay: 0.32s;
}

.dots {
	animation: blink 1.4s infinite;
}

@keyframes blink {
	0%,
	100% {
		opacity: 0.2;
	}
	50% {
		opacity: 1;
	}
}

@keyframes aiPulse {
	0%,
	100% {
		transform: translateY(0) scale(0.9);
		opacity: 0.45;
	}
	50% {
		transform: translateY(-1px) scale(1.12);
		opacity: 1;
	}
}

@media (max-width: 560px) {
	.ai-status-head {
		flex-direction: column;
		align-items: flex-start;
	}

	.ai-limit-grid {
		grid-template-columns: 1fr;
	}

	.chat-context-bar {
		padding: 10px 12px;
		border-radius: 16px;
	}

	.chat-context-bar--ai {
		min-height: 286px;
	}

	.context-status,
	.context-pill,
	.context-chip {
		font-size: 11px;
	}
}
</style>
