<template>
	<div class="input">
		<ScrollBtn />
		<div class="input-stack">
			<div v-if="pendingFile || pendingVoiceUrl || voiceError" class="input-preview">
				<div v-if="pendingFile" class="input-preview__item">
					<span class="input-preview__label">File</span>
					<strong>{{ pendingFile.name }}</strong>
					<small>{{ formatBytes(pendingFile.size) }}</small>
					<button type="button" class="input-preview__button" :disabled="uploading || isGenerating" @click="confirmFileUpload">
						Send
					</button>
					<button type="button" class="input-preview__button" :disabled="uploading || isGenerating" @click="clearPendingFile">
						Cancel
					</button>
				</div>

				<div v-if="pendingVoiceUrl" class="input-preview__item">
					<span class="input-preview__label">Voice</span>
					<audio class="input-preview__audio" controls :src="pendingVoiceUrl"></audio>
					<button type="button" class="input-preview__button" :disabled="isGenerating" @click="confirmVoiceSend">
						Send
					</button>
					<button type="button" class="input-preview__button" :disabled="isGenerating" @click="clearPendingVoice">
						Cancel
					</button>
				</div>

				<p v-if="voiceError" class="input-preview__error">{{ voiceError }}</p>
			</div>

		<div :class="['input-inner', { 'input-inner--ai': chat.isAiMode }]">
			<button
				:class="['attach-btn', { 'attach-btn--ai': chat.isAiMode }]"
				type="button"
				@click="openFilePicker"
				:disabled="disabled || uploading || isRecording || isGenerating"
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
				:class="['text-input', { 'text-input--ai': chat.isAiMode }]"
				v-model="text"
				@keydown.enter.prevent="handleEnter"
				placeholder="Напишите сообщение..."
				:disabled="disabled || isGenerating"
			/>

			<div class="action-slot">
				<div v-if="isRecording" ref="deleteZoneRef" :class="['delete-zone', { 'delete-zone--active': isDeleteHover }]">
					<span class="delete-zone__icon">🗑</span>
					<span class="delete-zone__label">Удалить</span>
				</div>

				<button
					v-if="showVoiceTrigger && !isGenerating"
					ref="voiceButtonRef"
					:class="['voice-btn', { 'voice-btn--ai': chat.isAiMode }]"
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
					:class="['send-btn', { 'send-btn--ai': chat.isAiMode }]"
					type="button"
					:disabled="sendButtonDisabled"
					@click="handleSendOrStopClick"
					@pointerdown="handleSendPressStart"
					@pointerup="handleSendPressEnd"
					@pointerleave="handleSendPressEnd"
					@pointercancel="handleSendPressEnd"
					:title="isGenerating ? 'Остановить запрос' : 'Отправить сообщение'"
				>
					{{ isGenerating ? '■' : '→' }}
				</button>
			</div>
		</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useChatStore } from '../../stores/chat'
import ScrollBtn from '../common/ScrollBtn.vue'

const LONG_PRESS_MS = 450
const VOICE_MODE_TIMEOUT_MS = 4000

const props = defineProps<{
	disabled?: boolean
	uploading?: boolean
	showFileAction?: boolean
	isGenerating?: boolean
}>()

const emit = defineEmits<{
	(e: 'send', message: string): void
	(e: 'stop'): void
	(e: 'upload-file', file: File): void
	(e: 'voice-recorded', file: File): void
	(e: 'voice-error', message: string): void
}>()

const chat = useChatStore()
const text = ref('')
const fileInputRef = ref<HTMLInputElement | null>(null)
const deleteZoneRef = ref<HTMLDivElement | null>(null)
const voiceButtonRef = ref<HTMLButtonElement | null>(null)
const isRecording = ref(false)
const isDeleteHover = ref(false)
const showVoiceTrigger = ref(false)
const pendingFile = ref<File | null>(null)
const pendingVoice = ref<File | null>(null)
const pendingVoiceUrl = ref('')
const voiceError = ref('')

let mediaRecorder: MediaRecorder | null = null
let mediaStream: MediaStream | null = null
let recordedChunks: Blob[] = []
let longPressTimer: number | null = null
let voiceModeTimer: number | null = null
let pressTriggeredVoiceMode = false
let discardRecording = false

const sendButtonDisabled = computed(() => {
	if (props.isGenerating) return false
	return !!props.disabled || (!text.value.trim() && !showVoiceTrigger.value)
})

const formatBytes = (value: number) => {
	if (!Number.isFinite(value) || value <= 0) return '0 B'
	if (value < 1024) return `${value} B`
	if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
	return `${(value / 1024 / 1024).toFixed(1)} MB`
}

const clearPendingFile = () => {
	pendingFile.value = null
}

const revokePendingVoiceUrl = () => {
	if (!pendingVoiceUrl.value) return
	URL.revokeObjectURL(pendingVoiceUrl.value)
	pendingVoiceUrl.value = ''
}

const clearPendingVoice = () => {
	revokePendingVoiceUrl()
	pendingVoice.value = null
	voiceError.value = ''
}

const confirmFileUpload = () => {
	if (!pendingFile.value || props.uploading || props.isGenerating) return
	const file = pendingFile.value
	pendingFile.value = null
	emit('upload-file', file)
}

const confirmVoiceSend = () => {
	if (!pendingVoice.value || props.isGenerating) return
	const file = pendingVoice.value
	clearPendingVoice()
	emit('voice-recorded', file)
}

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
	if (isRecording.value || props.isGenerating) return

	voiceModeTimer = window.setTimeout(() => {
		showVoiceTrigger.value = false
	}, VOICE_MODE_TIMEOUT_MS)
}

const submit = () => {
	if (!text.value.trim() || props.disabled || props.isGenerating) return
	emit('send', text.value)
	text.value = ''
	showVoiceTrigger.value = false
}

const handleEnter = () => {
	if (props.isGenerating) {
		emit('stop')
		return
	}
	submit()
}

const handleSendOrStopClick = () => {
	if (props.isGenerating) {
		emit('stop')
		return
	}

	if (pressTriggeredVoiceMode) {
		pressTriggeredVoiceMode = false
		return
	}

	submit()
}

const handleSendPressStart = () => {
	if (props.isGenerating) return
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
	if (props.isGenerating) return
	fileInputRef.value?.click()
}

const handleFileSelected = (event: Event) => {
	const input = event.target as HTMLInputElement
	const file = input.files?.[0]
	if (!file) return
	pendingFile.value = file
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
	if (props.isGenerating) return

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
		voiceError.value = ''
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

			clearPendingVoice()
			pendingVoice.value = file
			pendingVoiceUrl.value = URL.createObjectURL(file)

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
			voiceError.value = 'Не удалось записать голосовое сообщение'
			emit('voice-error', voiceError.value)
		}

		mediaRecorder.start()
		isRecording.value = true
		showVoiceTrigger.value = true
	} catch (error) {
		isRecording.value = false
		isDeleteHover.value = false
		stopRecordingTracks()
		scheduleVoiceModeHide()
		voiceError.value = (error as Error).message || 'Voice capture failed'
		emit('voice-error', voiceError.value)
	}
}

onBeforeUnmount(() => {
	clearLongPressTimer()
	clearVoiceModeTimer()
	clearPendingVoice()
	stopRecordingTracks()
})
</script>

