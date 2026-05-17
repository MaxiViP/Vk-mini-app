<template>
	<div class="input">
		<ScrollBtn />

		<div class="input-stack">
			<div v-if="pendingFile || pendingVoiceUrl || voiceError" class="input-preview">
				<div v-if="pendingFile" class="input-preview__item">
					<span class="input-preview__label">File</span>
					<strong>{{ pendingFile.name }}</strong>
					<small>{{ formatBytes(pendingFile.size) }}</small>

					<button
						type="button"
						class="input-preview__button"
						:disabled="uploading || isGenerating"
						@click="confirmFileUpload"
					>
						Send
					</button>

					<button
						type="button"
						class="input-preview__button"
						:disabled="uploading || isGenerating"
						@click="clearPendingFile"
					>
						Cancel
					</button>
				</div>

				<div v-if="pendingVoiceUrl" class="input-preview__item">
					<span class="input-preview__label">Voice</span>
					<audio class="input-preview__audio" controls :src="pendingVoiceUrl"></audio>

					<button
						type="button"
						class="input-preview__button"
						:disabled="isGenerating"
						@click="confirmVoiceSend"
					>
						Send
					</button>

					<button
						type="button"
						class="input-preview__button"
						:disabled="isGenerating"
						@click="clearPendingVoice"
					>
						Cancel
					</button>
				</div>

				<p v-if="voiceError" class="input-preview__error">{{ voiceError }}</p>
			</div>

			<div :class="['input-inner', { 'input-inner--ai': chat.isAiMode }]">
				<button
					:class="[
						'attach-btn',
						{
							'attach-btn--ai': chat.isAiMode,
							'action-icon-btn--burst': attachBurst,
						},
					]"
					type="button"
					@click="openFilePicker"
					:disabled="attachButtonDisabled"
					title="Добавить файл"
					aria-label="Добавить файл"
				>
					<span class="action-icon-btn__glow" aria-hidden="true"></span>

					<svg class="action-icon-btn__icon attach-btn__icon" viewBox="0 0 24 24" aria-hidden="true">
						<path class="attach-btn__circle" d="M12 3.75a8.25 8.25 0 1 0 0 16.5a8.25 8.25 0 0 0 0-16.5Z" />
						<path class="attach-btn__line attach-btn__line--horizontal" d="M8 12h8" />
						<path class="attach-btn__line attach-btn__line--vertical" d="M12 8v8" />
					</svg>
				</button>

				<input
					ref="fileInputRef"
					class="file-input"
					type="file"
					accept=".txt,.csv,.pdf,.docx,.xlsx"
					@change="handleFileSelected"
				/>

				<input
					ref="textInputRef"
					:class="['text-input', { 'text-input--ai': chat.isAiMode }]"
					v-model="text"
					@keydown.enter.prevent="handleEnter"
					placeholder="Напишите сообщение..."
					:disabled="disabled || isGenerating"
				/>

				<div class="action-slot">
					<div
						v-if="isRecording"
						ref="deleteZoneRef"
						:class="['delete-zone', { 'delete-zone--active': isDeleteHover }]"
					>
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
						:aria-label="isRecording ? 'Остановить запись' : 'Записать голосовое'"
						@pointermove="handleRecordingPointerMove"
						@pointerup="handleRecordingPointerRelease"
						@pointercancel="handleRecordingPointerCancel"
					>
						{{ isRecording ? '■' : '●' }}
					</button>

					<button
						v-else
						:class="[
							'send-btn',
							{
								'send-btn--ai': chat.isAiMode,
								'send-btn--stop': isGenerating,
								'send-btn--empty': !hasText && !isGenerating,
								'action-icon-btn--burst': sendBurst,
							},
						]"
						type="button"
						:disabled="sendButtonDisabled"
						@click="handleSendOrStopClick"
						@pointerdown="handleSendPressStart"
						@pointerup="handleSendPressEnd"
						@pointerleave="handleSendPressEnd"
						@pointercancel="handleSendPressEnd"
						:title="sendButtonTitle"
						:aria-label="sendButtonTitle"
					>
						<span class="action-icon-btn__glow" aria-hidden="true"></span>

						<svg
							v-if="isGenerating"
							class="action-icon-btn__icon send-btn__icon send-btn__icon--stop"
							viewBox="0 0 24 24"
							aria-hidden="true"
						>
							<rect x="8" y="8" width="8" height="8" rx="2" />
						</svg>

						<svg v-else class="action-icon-btn__icon send-btn__icon" viewBox="0 0 24 24" aria-hidden="true">
							<path class="send-btn__trail" d="M4 12h10" />
							<path class="send-btn__arrow" d="M11 5l7 7l-7 7" />
						</svg>
					</button>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { useChatStore } from '../../stores/chat'
import ScrollBtn from '../common/ScrollBtn.vue'

const LONG_PRESS_MS = 450
const VOICE_MODE_TIMEOUT_MS = 4000
const BURST_ANIMATION_MS = 560

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
const textInputRef = ref<HTMLInputElement | null>(null)
const deleteZoneRef = ref<HTMLDivElement | null>(null)
const voiceButtonRef = ref<HTMLButtonElement | null>(null)

const isRecording = ref(false)
const isDeleteHover = ref(false)
const showVoiceTrigger = ref(false)

const pendingFile = ref<File | null>(null)
const pendingVoice = ref<File | null>(null)
const pendingVoiceUrl = ref('')
const voiceError = ref('')

const attachBurst = ref(false)
const sendBurst = ref(false)

let mediaRecorder: MediaRecorder | null = null
let mediaStream: MediaStream | null = null
let recordedChunks: Blob[] = []

let longPressTimer: number | null = null
let voiceModeTimer: number | null = null
let attachBurstTimer: number | null = null
let sendBurstTimer: number | null = null

let pressTriggeredVoiceMode = false
let discardRecording = false

const hasText = computed(() => Boolean(text.value.trim()))

const attachButtonDisabled = computed(
	() => Boolean(props.disabled) || Boolean(props.uploading) || isRecording.value || Boolean(props.isGenerating),
)

const sendButtonDisabled = computed(() => {
	if (props.isGenerating) return false
	return Boolean(props.disabled)
})

const sendButtonTitle = computed(() => {
	if (props.isGenerating) return 'Остановить запрос'
	if (hasText.value) return 'Отправить сообщение'
	return 'Удерживайте для голосового ввода'
})

const formatBytes = (value: number) => {
	if (!Number.isFinite(value) || value <= 0) return '0 B'
	if (value < 1024) return `${value} B`
	if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
	return `${(value / 1024 / 1024).toFixed(1)} MB`
}

const triggerAttachBurst = () => {
	if (attachBurstTimer) window.clearTimeout(attachBurstTimer)

	attachBurst.value = false

	window.requestAnimationFrame(() => {
		attachBurst.value = true

		attachBurstTimer = window.setTimeout(() => {
			attachBurst.value = false
			attachBurstTimer = null
		}, BURST_ANIMATION_MS)
	})
}

const triggerSendBurst = () => {
	if (sendBurstTimer) window.clearTimeout(sendBurstTimer)

	sendBurst.value = false

	window.requestAnimationFrame(() => {
		sendBurst.value = true

		sendBurstTimer = window.setTimeout(() => {
			sendBurst.value = false
			sendBurstTimer = null
		}, BURST_ANIMATION_MS)
	})
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
	if (!hasText.value || props.disabled || props.isGenerating) return

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

	if (!hasText.value || props.disabled) return

	triggerSendBurst()
	submit()
}

const handleSendPressStart = () => {
	if (props.isGenerating) return
	if (props.disabled || props.uploading || hasText.value) return

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

const setText = async (value: string) => {
	text.value = value
	await nextTick()
	textInputRef.value?.focus()
}

const openFilePicker = () => {
	if (attachButtonDisabled.value) return

	triggerAttachBurst()
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
			const file = new File([blob], `voice-${Date.now()}.${extension}`, {
				type: blob.type || 'audio/webm',
			})

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

	if (attachBurstTimer) window.clearTimeout(attachBurstTimer)
	if (sendBurstTimer) window.clearTimeout(sendBurstTimer)

	clearPendingVoice()
	stopRecordingTracks()
})

defineExpose({
	setText,
})
</script>
