<template>
	<div class="input">
		<ScrollBtn />
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

