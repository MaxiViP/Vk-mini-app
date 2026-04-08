<template>
	<Teleport to="body">
		<Transition name="slide">
			<div v-if="visible" class="context-overlay" @click.self="close">
				<aside class="context-panel">
					<div class="context-header">
						<div>
							<h3>Контекст диалога</h3>
							<p>{{ chat.backendLabel }}</p>
						</div>
						<button class="context-close" @click="close" type="button">x</button>
					</div>

					<div class="context-body">
						<section class="context-section">
							<h4>Действия</h4>
							<div class="context-actions">
								<button
									class="primary-action"
									type="button"
									@click="openFilePicker"
									:disabled="!chat.isExternalBackend || chat.isUploadingFile || chat.isLoading"
								>
									{{ chat.isUploadingFile ? 'Загрузка...' : 'Добавить файл' }}
								</button>

								<button
									class="secondary-action"
									type="button"
									@click="toggleVoiceRecording"
									:disabled="!chat.isExternalBackend || chat.isUploadingFile || chat.isLoading"
								>
									{{ isRecording ? 'Остановить запись' : 'Записать голос' }}
								</button>
							</div>

							<input
								ref="fileInputRef"
								class="hidden-file-input"
								type="file"
								accept=".txt,.csv,.pdf,.docx,.xlsx"
								@change="handleFileSelected"
							/>

							<p v-if="!chat.isExternalBackend" class="context-empty">
								Файлы и голос работают только в режиме `vk-ai` backend.
							</p>
						</section>

						<section class="context-section">
							<h4>Сессия</h4>
							<div class="context-card">
								<p><b>Status:</b> {{ chat.backendStatus }}</p>
								<p><b>Conversation:</b> {{ chat.conversationId }}</p>
								<p><b>Base URL:</b> {{ chat.backendBaseUrl }}</p>
							</div>
						</section>

						<section class="context-section">
							<h4>Файлы</h4>
							<div v-if="chat.contextFiles.length" class="context-list">
								<div v-for="file in chat.contextFiles" :key="file" class="context-list-item">{{ file }}</div>
							</div>
							<p v-else class="context-empty">Файлы в контекст пока не загружались.</p>
						</section>

						<section class="context-section">
							<h4>Голос</h4>
							<div v-if="chat.voiceRecords.length" class="context-list">
								<div v-for="voice in chat.voiceRecords" :key="voice" class="context-list-item">{{ voice }}</div>
							</div>
							<p v-else class="context-empty">Голосовых сообщений пока нет.</p>
						</section>

						<section class="context-section">
							<h4>История источников</h4>
							<div v-if="chat.sourceHistory.length" class="source-history">
								<div v-for="item in chat.sourceHistory" :key="item.id" class="source-card">
									<div class="source-card-head">
										<span class="source-type">{{ item.sourceType || 'unknown' }}</span>
										<time>{{ formatDate(item.timestamp) }}</time>
									</div>
									<p v-if="item.transcript" class="source-transcript">Voice: {{ item.transcript }}</p>
									<p class="source-preview">{{ item.replyPreview }}</p>
									<div class="source-chip-list">
										<span v-for="source in item.sources" :key="`${item.id}-${source.type}-${source.name}`" class="source-chip">
											{{ source.type }} · {{ source.name }}
										</span>
									</div>
								</div>
							</div>
							<p v-else class="context-empty">История источников появится после первых ответов backend.</p>
						</section>
					</div>
				</aside>
			</div>
		</Transition>
	</Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useChatStore } from '../../stores/chat'

defineProps<{ visible: boolean }>()
const emit = defineEmits<{ (e: 'update:visible', value: boolean): void }>()
const chat = useChatStore()

const fileInputRef = ref<HTMLInputElement | null>(null)
const isRecording = ref(false)
let mediaRecorder: MediaRecorder | null = null
let mediaStream: MediaStream | null = null
let recordedChunks: Blob[] = []

const close = () => emit('update:visible', false)
const formatDate = (value: number) => new Date(value).toLocaleString()

const stopRecordingTracks = () => {
	mediaStream?.getTracks().forEach(track => track.stop())
	mediaStream = null
}

const openFilePicker = () => {
	fileInputRef.value?.click()
}

const handleFileSelected = async (event: Event) => {
	const input = event.target as HTMLInputElement
	const file = input.files?.[0]
	if (!file) return

	try {
		await chat.uploadContextFile(file)
	} catch (error) {
		chat.addSystemMessage(`Не удалось загрузить файл: ${(error as Error).message}`)
	}

	input.value = ''
}

const toggleVoiceRecording = async () => {
	try {
		if (isRecording.value) {
			mediaRecorder?.stop()
			return
		}

		if (!navigator.mediaDevices?.getUserMedia) {
			throw new Error('MediaRecorder is not supported in this browser')
		}

		mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })
		recordedChunks = []
		mediaRecorder = new MediaRecorder(mediaStream)

		mediaRecorder.ondataavailable = event => {
			if (event.data.size > 0) recordedChunks.push(event.data)
		}

		mediaRecorder.onstop = async () => {
			try {
				const blob = new Blob(recordedChunks, { type: mediaRecorder?.mimeType || 'audio/webm' })
				const extension = blob.type.includes('ogg') ? 'ogg' : 'webm'
				const file = new File([blob], `voice-${Date.now()}.${extension}`, { type: blob.type || 'audio/webm' })
				await chat.sendVoiceMessage(file)
			} catch (error) {
				chat.addSystemMessage(`Не удалось отправить голосовое: ${(error as Error).message}`)
			} finally {
				recordedChunks = []
				isRecording.value = false
				stopRecordingTracks()
			}
		}

		mediaRecorder.onerror = () => {
			isRecording.value = false
			stopRecordingTracks()
			chat.addSystemMessage('Голосовой ввод недоступен')
		}

		mediaRecorder.start()
		isRecording.value = true
	} catch (error) {
		isRecording.value = false
		stopRecordingTracks()
		chat.addSystemMessage(`Голосовой ввод недоступен: ${(error as Error).message}`)
	}
}
</script>

<style scoped>
.context-overlay {
	position: fixed;
	inset: 0;
	z-index: 1100;
	display: flex;
	justify-content: flex-end;
	background: rgba(0, 0, 0, 0.52);
}

.context-panel {
	width: min(460px, 100%);
	height: 100%;
	background: #161a22;
	border-left: 1px solid rgba(255, 255, 255, 0.08);
	box-shadow: -12px 0 40px rgba(0, 0, 0, 0.28);
	display: flex;
	flex-direction: column;
}

.context-header {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 12px;
	padding: 18px 18px 14px;
	border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.context-header h3,
.context-section h4 {
	margin: 0;
}

.context-header p {
	margin: 6px 0 0;
	color: var(--color-text-muted);
	font-size: 13px;
}

.context-close {
	width: 36px;
	height: 36px;
	border: none;
	border-radius: 50%;
	background: rgba(255, 255, 255, 0.08);
	color: #fff;
	cursor: pointer;
}

.context-body {
	flex: 1;
	overflow-y: auto;
	padding: 16px 18px 24px;
	display: flex;
	flex-direction: column;
	gap: 18px;
}

.context-section {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.context-actions {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
}

.primary-action,
.secondary-action {
	padding: 12px 14px;
	border-radius: 14px;
	border: none;
	cursor: pointer;
	font-weight: 600;
}

.primary-action {
	background: linear-gradient(180deg, var(--color-primary), var(--color-primary-hover));
	color: #fff;
}

.secondary-action {
	background: rgba(255, 107, 107, 0.16);
	color: #ffc1c1;
	border: 1px solid rgba(255, 107, 107, 0.18);
}

.primary-action:disabled,
.secondary-action:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.hidden-file-input {
	display: none;
}

.context-card,
.context-list-item,
.source-card {
	padding: 12px 14px;
	border-radius: 16px;
	background: rgba(255, 255, 255, 0.04);
	border: 1px solid rgba(255, 255, 255, 0.06);
}

.context-card p,
.source-card p {
	margin: 0;
}

.context-card p + p,
.source-card p + p {
	margin-top: 8px;
}

.context-list,
.source-history,
.source-chip-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.context-empty {
	margin: 0;
	color: var(--color-text-muted);
	font-size: 13px;
}

.source-card-head {
	display: flex;
	justify-content: space-between;
	gap: 8px;
	margin-bottom: 8px;
	font-size: 12px;
	color: var(--color-text-muted);
}

.source-type {
	display: inline-flex;
	padding: 4px 8px;
	border-radius: 999px;
	background: rgba(16, 163, 127, 0.15);
	color: #92ead4;
}

.source-transcript {
	color: #cfd8ff;
	font-size: 13px;
}

.source-preview {
	color: var(--color-text-soft);
	font-size: 13px;
	line-height: 1.45;
}

.source-chip-list {
	flex-direction: row;
	flex-wrap: wrap;
	margin-top: 10px;
}

.source-chip {
	display: inline-flex;
	padding: 4px 8px;
	border-radius: 999px;
	background: rgba(255, 255, 255, 0.08);
	font-size: 11px;
}

@media (max-width: 560px) {
	.context-panel {
		width: 100%;
	}

	.context-body {
		padding-inline: 12px;
	}

	.context-actions {
		grid-template-columns: 1fr;
	}
}
</style>
