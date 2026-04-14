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
							<h4>Память AI</h4>
							<label class="context-label" for="user-memory-textarea">
								Память AI — используется во всех AI-чатах. Сюда можно сохранить постоянные инструкции: как отвечать, что учитывать о вас, какой стиль держать.
							</label>
							<div class="context-presets">
								<span class="context-presets__label">Шаблоны памяти</span>
								<div class="context-presets__list">
									<button
										v-for="preset in userMemoryPresets"
										:key="preset.label"
										class="context-inline-btn"
										type="button"
										@click="applyUserMemoryPreset(preset.value)"
										:disabled="userMemoryStatus === 'saving'"
									>
										{{ preset.label }}
									</button>
								</div>
							</div>
							<textarea
								id="user-memory-textarea"
								v-model="userMemory"
								class="context-textarea"
								placeholder="Например: обращайся ко мне на ты, отвечай по делу, учитывай, что я backend-разработчик..."
								rows="5"
								:maxlength="USER_MEMORY_MAX_LENGTH"
							></textarea>
							<div class="context-inline-actions">
								<button class="context-inline-btn" type="button" @click="clearUserMemory" :disabled="userMemoryStatus === 'saving'">
									Очистить память
								</button>
							</div>
							<p class="context-hint">
								{{ userMemory.length }}/{{ USER_MEMORY_MAX_LENGTH }}
								<span v-if="userMemoryStatus === 'saving'">• сохраняется...</span>
								<span v-else-if="userMemoryStatus === 'saved'">• сохранено</span>
								<span v-else-if="userMemoryStatus === 'error'">• ошибка сохранения</span>
							</p>
							<p class="context-hint">Память будет применяться ко всем новым AI-ответам.</p>
						</section>

						<section class="context-section">
							<h4>Контекст для AI</h4>
							<label class="context-label" for="session-context-textarea">
								Контекст для AI — действует только в текущей сессии. Подходит для временных правил и текущих задач.
							</label>
							<textarea
								id="session-context-textarea"
								v-model="sessionContext"
								class="context-textarea"
								placeholder="Например: отвечай кратко, учитывай, что я разработчик..."
								rows="5"
								:maxlength="SESSION_CONTEXT_MAX_LENGTH"
							></textarea>
							<div class="context-inline-actions">
								<button class="context-inline-btn" type="button" @click="clearSessionContext">Очистить контекст</button>
							</div>
							<p class="context-hint">{{ sessionContext.length }}/{{ SESSION_CONTEXT_MAX_LENGTH }}</p>
							<p class="context-hint">Контекст применяется только к текущей AI-сессии.</p>
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
import { onBeforeUnmount, ref, watch } from 'vue'
import { fetchAiMemory, saveAiMemory } from '../../api/workspace'
import { useChatStore } from '../../stores/chat'
import { useUserStore } from '../../stores/user'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ (e: 'update:visible', value: boolean): void }>()
const chat = useChatStore()
const userStore = useUserStore()

const SESSION_CONTEXT_MAX_LENGTH = 1200
const USER_MEMORY_MAX_LENGTH = 1200
const userMemoryPresets = [
	{
		label: 'Разработчик',
		value: 'Отвечай структурно и по делу. Делай упор на практическую реализацию, код, риски и короткие примеры.',
	},
	{
		label: 'Маркетолог',
		value: 'Отвечай с фокусом на аудиторию, оффер, позиционирование, воронку, метрики и маркетинговые гипотезы.',
	},
	{
		label: 'Копирайтер',
		value: 'Пиши ясно, живо и убедительно. Предлагай сильные формулировки, заголовки и несколько стилистических вариантов.',
	},
]

const fileInputRef = ref<HTMLInputElement | null>(null)
const isRecording = ref(false)
const sessionContext = ref('')
const userMemory = ref('')
const userMemoryStatus = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
const isHydratingUserMemory = ref(false)
let mediaRecorder: MediaRecorder | null = null
let mediaStream: MediaStream | null = null
let recordedChunks: Blob[] = []
let saveUserMemoryTimer: number | null = null

const close = () => emit('update:visible', false)
const formatDate = (value: number) => new Date(value).toLocaleString()
const normalizeLimitedText = (value: string, maxLength: number) => String(value || '').slice(0, maxLength)
const loadSessionContext = () => {
	sessionContext.value = chat.readSessionContext(userStore.user?.vkId, chat.conversationId)
}
const clearSaveUserMemoryTimer = () => {
	if (saveUserMemoryTimer) {
		window.clearTimeout(saveUserMemoryTimer)
		saveUserMemoryTimer = null
	}
}

const loadUserMemory = async () => {
	if (!userStore.token) {
		userMemory.value = ''
		userMemoryStatus.value = 'idle'
		return
	}

	isHydratingUserMemory.value = true
	try {
		const payload = await fetchAiMemory(userStore.token)
		userMemory.value = normalizeLimitedText(payload.aiMemory || '', USER_MEMORY_MAX_LENGTH)
		userMemoryStatus.value = 'idle'
	} catch (error) {
		userMemoryStatus.value = 'error'
		console.warn('Failed to load AI memory', error)
	} finally {
		isHydratingUserMemory.value = false
	}
}

const persistUserMemory = async (value: string) => {
	if (!userStore.token) return

	userMemoryStatus.value = 'saving'
	try {
		const payload = await saveAiMemory(userStore.token, value)
		userMemory.value = normalizeLimitedText(payload.aiMemory || '', USER_MEMORY_MAX_LENGTH)
		userMemoryStatus.value = 'saved'
	} catch (error) {
		userMemoryStatus.value = 'error'
		console.warn('Failed to save AI memory', error)
	}
}
const applyUserMemoryPreset = (value: string) => {
	const normalized = normalizeLimitedText(value, USER_MEMORY_MAX_LENGTH)
	userMemory.value = normalized
	clearSaveUserMemoryTimer()
	void persistUserMemory(normalized.trim())
}
const clearUserMemory = () => {
	userMemory.value = ''
	clearSaveUserMemoryTimer()
	void persistUserMemory('')
}
const clearSessionContext = () => {
	sessionContext.value = ''
	chat.writeSessionContext('', userStore.user?.vkId, chat.conversationId)
}

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

watch(
	() => `${userStore.user?.vkId || 'guest'}:${chat.conversationId}`,
	() => {
		loadSessionContext()
	},
	{ immediate: true },
)

watch(sessionContext, value => {
	const normalized = normalizeLimitedText(value, SESSION_CONTEXT_MAX_LENGTH)
	if (normalized !== value) {
		sessionContext.value = normalized
		return
	}

	chat.writeSessionContext(normalized, userStore.user?.vkId, chat.conversationId)
})

watch(
	() => [props.visible, userStore.user?.vkId] as const,
	([visible]) => {
		if (!visible) return
		void loadUserMemory()
	},
	{ immediate: true },
)

watch(userMemory, value => {
	const normalized = normalizeLimitedText(value, USER_MEMORY_MAX_LENGTH)
	if (normalized !== value) {
		userMemory.value = normalized
		return
	}

	if (isHydratingUserMemory.value || !props.visible || !userStore.token) return

	clearSaveUserMemoryTimer()
	saveUserMemoryTimer = window.setTimeout(() => {
		void persistUserMemory(normalized.trim())
	}, 400)
})

onBeforeUnmount(() => {
	clearSaveUserMemoryTimer()
})
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

.context-label {
	color: var(--color-text-muted);
	font-size: 13px;
	line-height: 1.45;
}

.context-hint {
	margin: 0;
	color: var(--color-text-muted);
	font-size: 12px;
}

.context-inline-actions {
	display: flex;
	justify-content: flex-start;
}

.context-presets {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.context-presets__label {
	font-size: 12px;
	color: var(--color-text-muted);
}

.context-presets__list {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.context-inline-btn {
	padding: 7px 10px;
	border-radius: 999px;
	border: 1px solid rgba(255, 255, 255, 0.08);
	background: rgba(255, 255, 255, 0.04);
	color: var(--color-text-soft);
	font: inherit;
	font-size: 12px;
	cursor: pointer;
	transition:
		background var(--transition-base),
		border-color var(--transition-base),
		transform var(--transition-fast);
}

.context-inline-btn:hover:not(:disabled) {
	transform: translateY(-1px);
	background: rgba(255, 255, 255, 0.07);
	border-color: rgba(255, 255, 255, 0.14);
}

.context-inline-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.context-textarea {
	width: 100%;
	min-height: 112px;
	padding: 12px 14px;
	border-radius: 16px;
	border: 1px solid rgba(255, 255, 255, 0.08);
	background: rgba(255, 255, 255, 0.04);
	color: var(--color-text);
	font: inherit;
	line-height: 1.5;
	resize: vertical;
	box-sizing: border-box;
	outline: none;
	transition:
		border-color var(--transition-base),
		box-shadow var(--transition-base),
		background var(--transition-base);
}

.context-textarea:focus {
	border-color: var(--mode-accent-border, rgba(16, 163, 127, 0.35));
	box-shadow: 0 0 0 3px var(--mode-accent-soft, rgba(16, 163, 127, 0.12));
	background: rgba(255, 255, 255, 0.05);
}

.context-textarea::placeholder {
	color: var(--color-text-muted);
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
