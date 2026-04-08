<template>
	<div class="input">
		<ScrollBtn type="top" />
		<div class="input-inner">
			<button
				class="attach-btn"
				type="button"
				@click="openFilePicker"
				:disabled="disabled || uploading || isRecording"
				title="Добавить файл"
			>
				+
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

			<div class="action-slot">
				<div
					v-if="isRecording"
					ref="deleteZoneRef"
					:class="['delete-zone', { 'delete-zone--active': isDeleteHover }]"
				>
					🗑
				</div>

				<button
					v-if="showVoiceTrigger"
					ref="voiceButtonRef"
					class="voice-btn"
					type="button"
					@click="toggleVoiceRecording"
					:disabled="disabled || uploading"
					:title="isRecording ? 'Остановить запись' : 'Записать голосовое'"
					@pointermove="handleRecordingPointerMove"
					@pointerup="handleRecordingPointerRelease"
					@pointercancel="handleRecordingPointerCancel"
				>
					{{ isRecording ? '■' : '●' }}
				</button>

				<button
					v-else
					class="send-btn"
					type="button"
					:disabled="disabled || !text.trim()"
					@click="handleSendClick"
					@pointerdown="handleSendPressStart"
					@pointerup="handleSendPressEnd"
					@pointerleave="handleSendPressEnd"
					@pointercancel="handleSendPressEnd"
					title="Отправить сообщение"
				>
					→
				</button>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import ScrollBtn from '../common/ScrollBtn.vue'

const LONG_PRESS_MS = 450
const VOICE_MODE_TIMEOUT_MS = 4000

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
const deleteZoneRef = ref<HTMLDivElement | null>(null)
const voiceButtonRef = ref<HTMLButtonElement | null>(null)
const isRecording = ref(false)
const isDeleteHover = ref(false)
const showVoiceTrigger = ref(false)

let mediaRecorder: MediaRecorder | null = null
let mediaStream: MediaStream | null = null
let recordedChunks: Blob[] = []
let longPressTimer: number | null = null
let voiceModeTimer: number | null = null
let pressTriggeredVoiceMode = false
let discardRecording = false

const clearLongPressTimer = () => {
	if (longPressTimer) {
		window.clearTimeout(longPressTimer)
		longPressTimer = null
	}
}

const clearVoiceModeTimer = () => {
	if (voiceModeTimer) {
		window.clearTimeout(voiceModeTimer)
		voiceModeTimer = null
	}
}

const scheduleVoiceModeHide = () => {
	clearVoiceModeTimer()
	if (isRecording.value) return
	voiceModeTimer = window.setTimeout(() => {
		showVoiceTrigger.value = false
	}, VOICE_MODE_TIMEOUT_MS)
}

const submit = () => {
	if (!text.value.trim() || props.disabled) return
	emit('send', text.value)
	text.value = ''
}

const handleSendClick = () => {
	if (pressTriggeredVoiceMode) {
		pressTriggeredVoiceMode = false
		return
	}
	submit()
}

const handleSendPressStart = () => {
	if (props.disabled || props.uploading || text.value.trim()) return

	clearLongPressTimer()
	longPressTimer = window.setTimeout(() => {
		showVoiceTrigger.value = true
		pressTriggeredVoiceMode = true
		scheduleVoiceModeHide()
	}, LONG_PRESS_MS)
}

const handleSendPressEnd = () => {
	clearLongPressTimer()
	window.setTimeout(() => {
		pressTriggeredVoiceMode = false
	}, 0)
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

const isPointerInsideDeleteZone = (clientX: number, clientY: number) => {
	const rect = deleteZoneRef.value?.getBoundingClientRect()
	if (!rect) return false
	return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
}

const discardCurrentRecording = () => {
	discardRecording = true
	isDeleteHover.value = false
	mediaRecorder?.stop()
}

const handleRecordingPointerMove = (event: PointerEvent) => {
	if (!isRecording.value) return
	isDeleteHover.value = isPointerInsideDeleteZone(event.clientX, event.clientY)
}

const handleRecordingPointerRelease = (event: PointerEvent) => {
	if (!isRecording.value) return
	if (isPointerInsideDeleteZone(event.clientX, event.clientY)) {
		discardCurrentRecording()
		return
	}
	toggleVoiceRecording()
}

const handleRecordingPointerCancel = () => {
	if (!isRecording.value) return
	discardCurrentRecording()
}

const toggleVoiceRecording = async () => {
	clearVoiceModeTimer()

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
		discardRecording = false
		isDeleteHover.value = false
		mediaRecorder = new MediaRecorder(mediaStream)

		mediaRecorder.ondataavailable = event => {
			if (event.data.size > 0) recordedChunks.push(event.data)
		}

		mediaRecorder.onstop = () => {
			if (discardRecording) {
				recordedChunks = []
				isRecording.value = false
				stopRecordingTracks()
				scheduleVoiceModeHide()
				return
			}

			const blob = new Blob(recordedChunks, { type: mediaRecorder?.mimeType || 'audio/webm' })
			const extension = blob.type.includes('ogg') ? 'ogg' : 'webm'
			const file = new File([blob], `voice-${Date.now()}.${extension}`, { type: blob.type || 'audio/webm' })
			emit('voice-recorded', file)
			recordedChunks = []
			isRecording.value = false
			isDeleteHover.value = false
			stopRecordingTracks()
			scheduleVoiceModeHide()
		}

		mediaRecorder.onerror = () => {
			isRecording.value = false
			isDeleteHover.value = false
			stopRecordingTracks()
			scheduleVoiceModeHide()
			emit('voice-error', 'Не удалось записать голосовое сообщение')
		}

		mediaRecorder.start()
		isRecording.value = true
		showVoiceTrigger.value = true
	} catch (error) {
		isRecording.value = false
		isDeleteHover.value = false
		stopRecordingTracks()
		scheduleVoiceModeHide()
		emit('voice-error', (error as Error).message || 'Voice capture failed')
	}
}

onBeforeUnmount(() => {
	clearLongPressTimer()
	clearVoiceModeTimer()
	stopRecordingTracks()
})
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
		opacity var(--transition-base),
		box-shadow var(--transition-base);
}

.attach-btn {
	background: rgba(255, 255, 255, 0.1);
	flex-shrink: 0;
}

.voice-btn {
	background: rgba(255, 107, 107, 0.18);
	color: #ffc3c3;
	box-shadow: 0 0 0 1px rgba(255, 107, 107, 0.22);
}

.send-btn {
	background: var(--color-primary);
}

.attach-btn:hover:not(:disabled),
.voice-btn:hover:not(:disabled),
.send-btn:hover:not(:disabled) {
	transform: translateY(-1px);
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

.action-slot {
	width: 44px;
	height: 44px;
	flex-shrink: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	position: relative;
	overflow: visible;
}

.delete-zone {
	position: absolute;
	bottom: calc(100% + 10px);
	left: 50%;
	transform: translateX(-50%) scale(0.94);
	width: 44px;
	height: 44px;
	border-radius: 14px;
	display: flex;
	align-items: center;
	justify-content: center;
	background: rgba(255, 255, 255, 0.08);
	border: 1px solid rgba(255, 255, 255, 0.1);
	box-shadow: 0 12px 28px rgba(0, 0, 0, 0.22);
	font-size: 18px;
	pointer-events: none;
	transition:
		transform var(--transition-fast),
		background var(--transition-base),
		border-color var(--transition-base);
}

.delete-zone--active {
	background: rgba(255, 107, 107, 0.22);
	border-color: rgba(255, 107, 107, 0.45);
	transform: translateX(-50%) scale(1.06);
}

@media (max-width: 560px) {
	.attach-btn,
	.voice-btn,
	.send-btn,
	.action-slot {
		width: 40px;
		height: 40px;
		font-size: 15px;
	}

	.delete-zone {
		width: 40px;
		height: 40px;
	}
}
</style>
