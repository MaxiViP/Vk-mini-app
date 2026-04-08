<template>
	<div class="chat">
		<div v-if="chat.isExternalBackend" class="chat-context-bar">
			<div class="context-primary">
				<span :class="['context-status', `context-status--${chat.backendStatus}`]">
					{{ backendStatusLabel }}
				</span>
				<span class="context-pill">Session: {{ chat.conversationId }}</span>
				<span class="context-pill context-pill--muted">{{ chat.backendBaseUrl }}</span>
			</div>

			<div class="context-secondary">
				<button class="context-action" @click="chat.resetConversation" :disabled="chat.isLoading || chat.isUploadingFile">
					Сбросить контекст
				</button>
				<button class="context-action" @click="toggleContextPanel">Открыть панель контекста</button>
			</div>

			<div v-if="chat.contextFiles.length" class="context-chips">
				<span v-for="file in chat.contextFiles" :key="file" class="context-chip">
					Файл: {{ file }}
				</span>
			</div>

			<div v-if="chat.voiceRecords.length" class="context-chips">
				<span v-for="voice in chat.voiceRecords" :key="voice" class="context-chip context-chip--voice">
					Voice: {{ voice }}
				</span>
			</div>
		</div>

		<div class="messages">
			<ScrollBtn type="bottom" class="scroll-down" />
			<Message v-for="(msg, idx) in chat.messages" :key="idx" :message="msg" />
			<div v-if="chat.isLoading" class="message assistant typing">
				<div class="avatar">🤖</div>
				<div class="bubble typing-indicator">
					<span>{{ typingLabel }}</span>
					<span class="dots">...</span>
				</div>
			</div>
		</div>

		<ChatInput
			@send="sendWithFallback"
			@upload-file="uploadFile"
			@voice-recorded="uploadVoice"
			@voice-error="handleVoiceError"
			:disabled="chat.isLoading"
			:uploading="chat.isUploadingFile"
			:show-file-action="chat.isExternalBackend"
		/>

		<ChatContextPanel v-model:visible="showContextPanel" />
	</div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useChatStore } from '../../stores/chat'
import { useModelsStore } from '../../stores/models'
import type { Model } from '../../types'
import Message from './Message.vue'
import ChatInput from './ChatInput.vue'
import ChatContextPanel from './ChatContextPanel.vue'
import ScrollBtn from '../common/ScrollBtn.vue'

const chat = useChatStore()
const modelsStore = useModelsStore()
const showContextPanel = ref(false)

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

const typingLabel = computed(() => (chat.isExternalBackend ? 'Ищем ответ в VK AI' : 'Печатает'))

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

async function sendWithFallback(messageText: string) {
	if (chat.isExternalBackend) {
		chat.addUserMessage(messageText)
		try {
			await chat.sendMessage(messageText, fallbackExternalModel, chat.messages.map(m => ({ role: m.role, content: m.content })))
		} catch (error) {
			chat.addSystemMessage(`VK AI backend недоступен: ${(error as Error).message}`)
		}
		return
	}

	const currentModel = modelsStore.getCurrentModel()
	if (!currentModel) return

	const allModels = modelsStore.models
	const startIndex = allModels.findIndex(m => m.id === currentModel?.id)
	const orderedModels = [...allModels.slice(startIndex), ...allModels.slice(0, startIndex)]

	const baseHistory = chat.messages.map(m => ({ role: m.role, content: m.content }))
	chat.addUserMessage(messageText)

	let lastError: Error | null = null

	for (const model of orderedModels) {
		try {
			await chat.sendMessage(messageText, model, baseHistory)
			if (model.id !== currentModel?.id) {
				modelsStore.selectModel(model.id)
				console.log(`Переключились на рабочую модель: ${model.name}`)
			}
			return
		} catch (error) {
			console.warn(`Модель ${model.name} не ответила:`, error)
			lastError = error as Error
			chat.addSystemMessage(`Модель "${model.name}" не ответила, пробуем другую...`)
		}
	}

	chat.addSystemMessage(`Ни одна модель не ответила. Последняя ошибка: ${lastError?.message}`)
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

onMounted(() => {
	window.addEventListener('toggle-chat-context', handleToggleChatContext as EventListener)
})

onUnmounted(() => {
	window.removeEventListener('toggle-chat-context', handleToggleChatContext as EventListener)
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
	background: rgba(255, 255, 255, 0.03);
	box-sizing: border-box;
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
	background: rgba(16, 163, 127, 0.15);
	color: #7ef0cb;
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
}

.context-pill--muted {
	max-width: 100%;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.context-chip--voice {
	background: rgba(125, 145, 255, 0.16);
	color: #bfd0ff;
}

.context-action {
	border: 1px solid rgba(255, 255, 255, 0.12);
	background: rgba(255, 255, 255, 0.04);
	color: var(--color-text);
	padding: 8px 12px;
	border-radius: 999px;
	cursor: pointer;
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

@media (max-width: 560px) {
	.chat-context-bar {
		padding: 10px 12px;
		border-radius: 16px;
	}

	.context-status,
	.context-pill,
	.context-chip {
		font-size: 11px;
	}
}
</style>
