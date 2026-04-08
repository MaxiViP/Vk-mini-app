<template>
	<div class="input">
		<ScrollBtn type="top" />
		<div class="input-inner">
			<button
				v-if="showFileAction"
				class="attach-btn"
				type="button"
				@click="openFilePicker"
				:disabled="disabled || uploading"
				title="Добавить файл в контекст"
			>
				{{ uploading ? '...' : '+' }}
			</button>

			<button
				v-if="showFileAction"
				class="voice-btn"
				type="button"
				@click="toggleVoiceRecording"
				:disabled="disabled || uploading"
				:title="isRecording ? 'Остановить запись' : 'Записать голосовое'"
			>
				{{ isRecording ? '■' : '●' }}
			</button>

			<input
				ref="fileInputRef"
				class="file-input"
				type="file"
				accept=".txt,.csv,.pdf,.docx,.xlsx"
				@change="handleFileSelected"
			/>

			<input
				v-model="text"
				@keydown.enter.prevent="submit"
				placeholder="Напишите сообщение..."
				:disabled="disabled"
			/>

			<button class="send-btn" @click="submit" :disabled="disabled || !text.trim()" type="button">→</button>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import ScrollBtn from '../common/ScrollBtn.vue'

const props = defineProps<{
	disabled?: boolean
	uploading?: boolean
	showFileAction?: boolean
}>()

const emit = defineEmits<{
	(e: 'send', message: string): void
	(e: 'upload-file', file: File): void
	(e: 'voice-recorded', file: File): void
	(e: 'voice-error', message: string): void
}>()

const text = ref('')
const fileInputRef = ref<HTMLInputElement | null>(null)
const isRecording = ref(false)
let mediaRecorder: MediaRecorder | null = null
let mediaStream: MediaStream | null = null
let recordedChunks: Blob[] = []

const submit = () => {
	if (!text.value.trim() || props.disabled) return
	emit('send', text.value)
	text.value = ''
}

const openFilePicker = () => {
	fileInputRef.value?.click()
}

const handleFileSelected = (event: Event) => {
	const input = event.target as HTMLInputElement
	const file = input.files?.[0]
	if (!file) return
	emit('upload-file', file)
	input.value = ''
}

const stopRecordingTracks = () => {
	mediaStream?.getTracks().forEach(track => track.stop())
	mediaStream = null
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

		mediaRecorder.onstop = () => {
			const blob = new Blob(recordedChunks, { type: mediaRecorder?.mimeType || 'audio/webm' })
			const extension = blob.type.includes('ogg') ? 'ogg' : 'webm'
			const file = new File([blob], `voice-${Date.now()}.${extension}`, { type: blob.type || 'audio/webm' })
			emit('voice-recorded', file)
			recordedChunks = []
			isRecording.value = false
			stopRecordingTracks()
		}

		mediaRecorder.onerror = () => {
			isRecording.value = false
			stopRecordingTracks()
			emit('voice-error', 'Не удалось записать голосовое сообщение')
		}

		mediaRecorder.start()
		isRecording.value = true
	} catch (error) {
		isRecording.value = false
		stopRecordingTracks()
		emit('voice-error', (error as Error).message || 'Voice capture failed')
	}
}
</script>

<style scoped>
.input {
	align-items: flex-end;
}

.input-inner {
	display: flex;
	align-items: center;
	gap: 10px;
	width: 100%;
	box-sizing: border-box;
}

.file-input {
	display: none;
}

.attach-btn,
.voice-btn,
.send-btn {
	width: 44px;
	height: 44px;
	border: none;
	border-radius: 50%;
	color: #fff;
	cursor: pointer;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 18px;
	transition:
		transform var(--transition-fast),
		background var(--transition-base),
		opacity var(--transition-base);
}

.attach-btn {
	background: rgba(255, 255, 255, 0.1);
	flex-shrink: 0;
}

.voice-btn {
	background: rgba(255, 107, 107, 0.16);
	color: #ffb9b9;
	flex-shrink: 0;
}

.attach-btn:hover:not(:disabled),
.voice-btn:hover:not(:disabled),
.send-btn:hover:not(:disabled) {
	transform: translateY(-1px);
}

.input-inner input[type='file'] + input,
.input-inner > input:not([type='file']) {
	flex: 1;
	min-width: 0;
	border: none;
	outline: none;
	background: transparent;
	color: var(--color-text);
	font-size: 15px;
	line-height: 1.4;
}

.input-inner > input:not([type='file'])::placeholder {
	color: var(--color-text-muted);
}

.send-btn {
	background: var(--color-primary);
}

.send-btn:hover:not(:disabled) {
	background: var(--color-primary-hover);
}

.attach-btn:disabled,
.voice-btn:disabled,
.send-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

@media (max-width: 560px) {
	.attach-btn,
	.voice-btn,
	.send-btn {
		width: 40px;
		height: 40px;
		font-size: 15px;
	}
}
</style>
