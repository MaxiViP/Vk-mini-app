<template>
	<div
		:class="[
			'message',
			message.role,
			{
				'message--quick-context-open': isQuickContextVisible,
				'message--user-profile-open': isUserProfileVisible,
			},
		]"
	>
		<div class="assistant-avatar-stack">
			<button
				v-if="isQuickContextAvailable"
				:class="['avatar', 'avatar--assistant', 'avatar--button']"
				type="button"
				:aria-expanded="quickContextOpen"
				:aria-controls="quickContextPanelId"
				title="Изменить быстрый контекст"
				aria-label="Изменить быстрый контекст AI"
				@click="toggleQuickContext"
			>
				<svg class="avatar__icon avatar__icon--assistant" viewBox="0 0 24 24">
					<rect x="5" y="7" width="14" height="11" rx="4" />
					<path d="M12 3v4" />
					<path d="M8.5 12h.01" />
					<path d="M15.5 12h.01" />
					<path d="M9.5 15.5c1.35 1 3.65 1 5 0" />
					<path d="M4 12h1" />
					<path d="M19 12h1" />
				</svg>
			</button>

			<button
				v-else-if="isUserProfileAvailable"
				:class="['avatar', 'avatar--user', 'avatar--button']"
				type="button"
				:aria-expanded="userProfileOpen"
				:aria-controls="userProfileId"
				title="Информация о пользователе"
				aria-label="Открыть быстрый профиль пользователя"
				@click="toggleUserProfile"
			>
				<svg class="avatar__icon" viewBox="0 0 24 24">
					<path d="M20 21a8 8 0 0 0-16 0" />
					<circle cx="12" cy="7" r="4" />
				</svg>
			</button>

			<div v-else :class="['avatar', `avatar--${message.role}`]" aria-hidden="true">
				<svg v-if="message.role === 'user'" class="avatar__icon" viewBox="0 0 24 24">
					<path d="M20 21a8 8 0 0 0-16 0" />
					<circle cx="12" cy="7" r="4" />
				</svg>

				<svg v-else class="avatar__icon avatar__icon--assistant" viewBox="0 0 24 24">
					<rect x="5" y="7" width="14" height="11" rx="4" />
					<path d="M12 3v4" />
					<path d="M8.5 12h.01" />
					<path d="M15.5 12h.01" />
					<path d="M9.5 15.5c1.35 1 3.65 1 5 0" />
					<path d="M4 12h1" />
					<path d="M19 12h1" />
				</svg>
			</div>

			<Transition name="quick-context-slide">
				<form
					v-if="isQuickContextVisible"
					:id="quickContextPanelId"
					ref="quickContextRef"
					class="assistant-quick-context"
					@submit.prevent="saveQuickContext"
				>
					<div class="assistant-quick-context__header">
						<span class="assistant-quick-context__label">Быстрый контекст</span>

						<div class="assistant-quick-context__switch" role="tablist" aria-label="Тип быстрого контекста">
							<button
								type="button"
								:class="[
									'assistant-quick-context__switch-btn',
									{ active: quickContextMode === 'session' },
								]"
								:aria-selected="quickContextMode === 'session'"
								role="tab"
								@click="switchQuickContextMode('session')"
							>
								Контекст
							</button>

							<button
								type="button"
								:class="[
									'assistant-quick-context__switch-btn',
									{ active: quickContextMode === 'memory' },
								]"
								:aria-selected="quickContextMode === 'memory'"
								role="tab"
								@click="switchQuickContextMode('memory')"
							>
								Память
							</button>

							<button
								type="button"
								:class="[
									'assistant-quick-context__switch-btn',
									{ active: quickContextMode === 'files' },
								]"
								:aria-selected="quickContextMode === 'files'"
								role="tab"
								@click="switchQuickContextMode('files')"
							>
								Файлы
								<span v-if="chat.contextFiles.length" class="assistant-quick-context__tab-count">
									{{ chat.activeContextFiles.length }}/{{ chat.contextFiles.length }}
								</span>
							</button>

							<button
								type="button"
								:class="[
									'assistant-quick-context__switch-btn',
									{ active: quickContextMode === 'audio' },
								]"
								:aria-selected="quickContextMode === 'audio'"
								role="tab"
								@click="switchQuickContextMode('audio')"
							>
								Аудио
								<span v-if="voiceRecords.length" class="assistant-quick-context__tab-count">
									{{ activeVoiceRecords.length }}/{{ voiceRecords.length }}
								</span>
							</button>
						</div>
					</div>

					<textarea
						v-if="!isQuickContextListMode"
						:id="quickContextInputId"
						ref="quickContextInputRef"
						v-model="quickContextDraft"
						class="assistant-quick-context__input"
						rows="2"
						:maxlength="quickContextMaxLength"
						:placeholder="quickContextPlaceholder"
						aria-label="Быстрый контекст"
						@keydown.esc.prevent="closeQuickContext"
						@keydown.ctrl.enter.prevent="saveQuickContext"
					></textarea>

					<div
						v-else-if="isQuickContextFilesMode"
						class="assistant-quick-context__files"
						role="tabpanel"
						aria-label="Файлы в контексте"
					>
						<ConfirmDeleteChip
							v-for="file in chat.contextFiles"
							:key="file"
							class="assistant-quick-context__file"
							:label="file"
							selectable
							:selected="chat.selectedContextFiles.includes(file)"
							title="Файл в контексте"
							@update:selected="chat.setContextFileSelected(file, $event)"
							@delete="chat.removeContextFile(file)"
						/>

						<p v-if="!chat.contextFiles.length" class="assistant-quick-context__empty">
							Файлы в контекст пока не добавлены.
						</p>
					</div>

					<div
						v-else-if="isQuickContextAudioMode"
						class="assistant-quick-context__files"
						role="tabpanel"
						aria-label="Аудио в контексте"
					>
						<ConfirmDeleteChip
							v-for="audio in voiceRecords"
							:key="audio"
							class="assistant-quick-context__file"
							:label="audio"
							selectable
							:selected="isVoiceRecordSelected(audio)"
							title="Аудио в контексте"
							@update:selected="setVoiceRecordSelected(audio, $event)"
							@delete="removeVoiceRecord(audio)"
						/>

						<p v-if="!voiceRecords.length" class="assistant-quick-context__empty">
							Аудиофайлы в контекст пока не добавлены.
						</p>
					</div>

					<div class="assistant-quick-context__actions">
						<button
							v-if="!isQuickContextListMode"
							class="assistant-quick-context__btn assistant-quick-context__btn--primary"
							type="submit"
							:disabled="!canSaveQuickContext"
						>
							{{ quickContextSaving ? 'Сохраняем...' : 'Сохранить' }}
						</button>

						<button
							v-if="!isQuickContextListMode"
							class="assistant-quick-context__btn"
							type="button"
							:disabled="!canClearQuickContext"
							@click="clearQuickContext"
						>
							Очистить
						</button>

						<button class="assistant-quick-context__btn" type="button" @click="closeQuickContext">
							Закрыть
						</button>
					</div>
				</form>
			</Transition>

			<Transition name="quick-context-slide">
				<div
					v-if="isUserProfileVisible"
					:id="userProfileId"
					ref="userProfileRef"
					class="user-quick-profile"
				>
					<div class="user-quick-profile__header">
						<div>
							<strong>{{ userDisplayName }}</strong>
							<span>Быстрый доступ к данным аккаунта</span>
						</div>

						<button
							class="user-quick-profile__close"
							type="button"
							title="Закрыть"
							aria-label="Закрыть быстрый профиль"
							@click="closeUserProfile"
						>
							✕
						</button>
					</div>

					<div class="user-quick-profile__grid">
						<div v-for="row in userProfileRows" :key="row.label" class="user-quick-profile__row">
							<span>{{ row.label }}</span>
							<b>{{ row.value }}</b>
						</div>
					</div>

					<div v-if="aiAccess" class="user-quick-profile__chips">
						<span :class="['user-quick-profile__chip', { active: aiCapabilities.chat }]">Чат</span>
						<span :class="['user-quick-profile__chip', { active: aiCapabilities.fileUpload }]">
							Файлы
						</span>
						<span :class="['user-quick-profile__chip', { active: aiCapabilities.voice }]">Голос</span>
					</div>
				</div>
			</Transition>
		</div>

		<div :class="['bubble', { 'bubble--editing': isEditing }]">
			<div v-if="message.meta?.transcript" class="meta-transcript">
				Распознано: {{ message.meta.transcript }}
			</div>

			<form v-if="isEditing" class="message-edit-form" @submit.prevent="confirmEdit">
				<textarea
					ref="editTextareaRef"
					v-model="editText"
					class="message-edit-textarea"
					rows="3"
					@keydown.esc.prevent="cancelEdit"
				></textarea>

				<div class="message-edit-actions">
					<button
						class="message-edit-btn message-edit-btn--primary"
						type="submit"
						:disabled="!canConfirmEdit"
						title="Отправить изменённое сообщение"
						aria-label="Отправить изменённое сообщение"
					>
						✅ Отправить
					</button>

					<button
						class="message-edit-btn"
						type="button"
						@click="cancelEdit"
						title="Отменить редактирование"
						aria-label="Отменить редактирование"
					>
						❌ Отмена
					</button>
				</div>
			</form>

			<div v-else class="content" v-html="renderedContent"></div>

			<audio
				v-if="resolvedAudioReplyUrl"
				ref="audioReplyRef"
				class="audio-reply"
				controls
				:src="resolvedAudioReplyUrl"
			></audio>

			<div v-if="isAssistantMessage && !isEditing" class="assistant-response-actions">
				<div class="assistant-response-actions__buttons">
					<button type="button" class="assistant-response-action" @click="copyAssistantResponse">
						Скопировать
					</button>
					<button type="button" class="assistant-response-action" @click="saveToNotes">
						Сохранить
					</button>
					<button
						v-if="FEATURES.sharing"
						type="button"
						class="assistant-response-action"
						@click="shareAssistantResponse"
					>
						Поделиться
					</button>
					<button type="button" class="assistant-response-action" @click="openPromptAction('shorten')">
						Сделать короче
					</button>
					<button type="button" class="assistant-response-action" @click="openPromptAction('improve')">
						Улучшить
					</button>
					<button type="button" class="assistant-response-action" @click="openPromptAction('continue')">
						Продолжить
					</button>
					<button type="button" class="assistant-response-action" @click="openPromptAction('vk-post')">
						Использовать как пост VK
					</button>
				</div>

				<span v-if="assistantActionStatus" class="assistant-response-actions__status">
					{{ assistantActionStatus }}
				</span>
			</div>

			<div v-if="!isEditing" :class="['message-actions', { 'message-actions--open': areActionsOpen }]">
				<button
					class="message-actions__toggle"
					type="button"
					:aria-expanded="areActionsOpen"
					:title="areActionsOpen ? 'Скрыть действия' : 'Показать действия'"
					:aria-label="areActionsOpen ? 'Скрыть действия сообщения' : 'Показать действия сообщения'"
					@click="toggleActionsMenu"
				>
					<svg
						class="message-actions__chevron"
						:class="{ 'message-actions__chevron--open': areActionsOpen }"
						viewBox="0 0 24 24"
						aria-hidden="true"
					>
						<path d="M15 18l-6-6 6-6" />
					</svg>
				</button>

				<div class="message-actions__panel" :aria-hidden="!areActionsOpen">
					<button
						class="message-action"
						:class="{ 'message-action--success': copyStatus === 'copied' }"
						type="button"
						:tabindex="areActionsOpen ? 0 : -1"
						@click="copyMessage"
						:title="copyTitle"
						:aria-label="copyAriaLabel"
					>
						<svg
							v-if="copyStatus === 'copied'"
							key="copy-success"
							class="message-action__icon"
							viewBox="0 0 24 24"
							aria-hidden="true"
						>
							<path d="M20 6 9 17l-5-5" />
						</svg>

						<svg v-else key="copy" class="message-action__icon" viewBox="0 0 24 24" aria-hidden="true">
							<rect x="9" y="9" width="11" height="11" rx="2" />
							<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
						</svg>
					</button>

					<button
						v-if="message.role === 'assistant'"
						class="message-action save-note"
						type="button"
						:tabindex="areActionsOpen ? 0 : -1"
						@click="saveToNotes"
						title="Сохранить в заметки"
						aria-label="Сохранить ответ в заметки"
					>
						<svg class="message-action__icon" viewBox="0 0 24 24" aria-hidden="true">
							<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
							<path d="M17 21v-8H7v8" />
							<path d="M7 3v5h8" />
						</svg>
					</button>

					<template v-if="message.role === 'user'">
						<button
							class="message-action"
							type="button"
							:tabindex="areActionsOpen ? 0 : -1"
							@click="startEdit"
							:disabled="actionsDisabled"
							title="Изменить"
							aria-label="Изменить сообщение"
						>
							<svg class="message-action__icon" viewBox="0 0 24 24" aria-hidden="true">
								<path d="M12 20h9" />
								<path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
							</svg>
						</button>

						<button
							class="message-action"
							:class="{ 'message-action--success': resendStatus === 'sent' }"
							type="button"
							:tabindex="areActionsOpen ? 0 : -1"
							@click="resendMessage"
							:disabled="actionsDisabled"
							:title="resendTitle"
							:aria-label="resendAriaLabel"
						>
							<svg
								v-if="resendStatus === 'sent'"
								key="resend-success"
								class="message-action__icon"
								viewBox="0 0 24 24"
								aria-hidden="true"
							>
								<path d="M20 6 9 17l-5-5" />
							</svg>

							<svg v-else key="resend" class="message-action__icon" viewBox="0 0 24 24" aria-hidden="true">
								<path d="M21 12a9 9 0 1 1-2.64-6.36" />
								<path d="M21 3v6h-6" />
							</svg>
						</button>
					</template>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import type { Message } from '../../types'
import { FEATURES } from '../../config/features'
import { HOME_PROMPT_EVENT, HOME_PROMPT_STORAGE_KEY } from '../../data/homeCards'
import {
	buildAiCapabilities,
	emptyAiCapabilities,
	emptyAiCounters,
	isAiSubscriptionActive,
	normalizeAiCounters,
} from '../../domain/aiSubscription'
import { useChatStore } from '../../stores/chat'
import ConfirmDeleteChip from './ConfirmDeleteChip.vue'

type MarkdownRenderer = {
	parse: (value: string) => string
}

type QuickContextMode = 'session' | 'memory' | 'files' | 'audio'

type UserQuickProfile = {
	user?: Record<string, unknown> | null
	aiAccess?: Record<string, any> | null
	isAuthenticated?: boolean
}

let markdownRendererPromise: Promise<MarkdownRenderer> | null = null

const CODE_LANGUAGE_ALIASES: Record<string, string> = {
	html: 'xml',
	vue: 'xml',
	shell: 'bash',
	sh: 'bash',
	zsh: 'bash',
	yml: 'yaml',
}

const normalizeCodeLanguage = (language?: string) => {
	const normalized = language?.trim().toLowerCase()
	if (!normalized) return 'plaintext'
	return CODE_LANGUAGE_ALIASES[normalized] || normalized
}

const MARKDOWN_PATTERN =
	/```|`[^`\n]+`|^\s{0,3}#{1,6}\s|^\s*[-*+]\s|^\s*\d+\.\s|^\s*>\s|\[[^\]]+\]\([^)]+\)|(\*\*|__)[^\n]+(\*\*|__)|^\|.+\|/m

const loadMarkdownRenderer = () => {
	if (!markdownRendererPromise) {
		markdownRendererPromise = Promise.all([
			import('marked'),
			import('highlight.js/lib/core'),
			import('highlight.js/lib/languages/javascript'),
			import('highlight.js/lib/languages/typescript'),
			import('highlight.js/lib/languages/json'),
			import('highlight.js/lib/languages/bash'),
			import('highlight.js/lib/languages/css'),
			import('highlight.js/lib/languages/xml'),
			import('highlight.js/lib/languages/markdown'),
			import('highlight.js/lib/languages/python'),
			import('highlight.js/lib/languages/sql'),
			import('highlight.js/lib/languages/yaml'),
			import('highlight.js/styles/github-dark.css'),
		]).then(
			([
				markedModule,
				hljsModule,
				javascriptModule,
				typescriptModule,
				jsonModule,
				bashModule,
				cssModule,
				xmlModule,
				markdownModule,
				pythonModule,
				sqlModule,
				yamlModule,
			]) => {
				const { marked } = markedModule
				const hljs = hljsModule.default

				hljs.registerLanguage('javascript', javascriptModule.default)
				hljs.registerLanguage('typescript', typescriptModule.default)
				hljs.registerLanguage('json', jsonModule.default)
				hljs.registerLanguage('bash', bashModule.default)
				hljs.registerLanguage('css', cssModule.default)
				hljs.registerLanguage('xml', xmlModule.default)
				hljs.registerLanguage('markdown', markdownModule.default)
				hljs.registerLanguage('python', pythonModule.default)
				hljs.registerLanguage('sql', sqlModule.default)
				hljs.registerLanguage('yaml', yamlModule.default)

				marked.use({
					gfm: true,
					breaks: true,
					renderer: {
						code({ text, lang }) {
							const normalizedLanguage = normalizeCodeLanguage(lang)
							if (!hljs.getLanguage(normalizedLanguage)) {
								return `<pre><code class="hljs language-plaintext">${escapeHtml(text)}</code></pre>`
							}

							const language = normalizedLanguage
							const highlighted = hljs.highlight(text, { language }).value
							return `<pre><code class="hljs language-${language}">${highlighted}</code></pre>`
						},
					},
				})

				return {
					parse: value => marked.parse(value, { async: false }) as string,
				}
			},
		)
	}

	return markdownRendererPromise
}

const escapeHtml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;')

const renderPlainText = (value: string) => escapeHtml(value).replaceAll('\n', '<br>')
const looksLikeMarkdown = (message: Message) => message.role === 'assistant' && MARKDOWN_PATTERN.test(message.content)

const props = withDefaults(
	defineProps<{
		message: Message
		index?: number
		showLimits?: boolean
		actionsDisabled?: boolean
		quickContextEnabled?: boolean
		quickContextOpen?: boolean
		quickContextValue?: string
		quickContextMaxLength?: number
		quickContextMode?: QuickContextMode
		quickContextSaving?: boolean
		userProfileEnabled?: boolean
		userProfileOpen?: boolean
		userProfile?: UserQuickProfile
	}>(),
	{
		index: -1,
		actionsDisabled: false,
		quickContextEnabled: false,
		quickContextOpen: false,
		quickContextValue: '',
		quickContextMaxLength: 1200,
		quickContextMode: 'session',
		quickContextSaving: false,
		userProfileEnabled: false,
		userProfileOpen: false,
		userProfile: () => ({
			user: null,
			aiAccess: null,
			isAuthenticated: false,
		}),
	},
)

const emit = defineEmits<{
	(e: 'edit-message', payload: { index: number; content: string }): void
	(e: 'resend-message', payload: { index: number; content: string }): void
	(e: 'toggle-quick-context', payload: { index: number }): void
	(e: 'switch-quick-context-mode', payload: { index: number; mode: QuickContextMode }): void
	(e: 'save-quick-context', payload: { index: number; content: string; mode: QuickContextMode }): void
	(e: 'close-quick-context', payload: { index: number }): void
	(e: 'toggle-user-profile', payload: { index: number }): void
	(e: 'close-user-profile', payload: { index: number }): void
}>()

const chat = useChatStore()
const chatApi = chat as any

const audioReplyRef = ref<HTMLAudioElement | null>(null)
const editTextareaRef = ref<HTMLTextAreaElement | null>(null)
const quickContextRef = ref<HTMLElement | null>(null)
const quickContextInputRef = ref<HTMLTextAreaElement | null>(null)
const userProfileRef = ref<HTMLElement | null>(null)

const renderedContent = ref('')
const isEditing = ref(false)
const areActionsOpen = ref(false)
const editText = ref(props.message.content)
const quickContextDraft = ref(props.quickContextValue)
const copyStatus = ref<'idle' | 'copied'>('idle')
const resendStatus = ref<'idle' | 'sent'>('idle')
const assistantActionStatus = ref('')

let renderToken = 0
let copyStatusTimer: number | null = null
let resendStatusTimer: number | null = null
let assistantActionStatusTimer: number | null = null

const voiceRecords = computed<string[]>(() => (Array.isArray(chat.voiceRecords) ? chat.voiceRecords : []))

const selectedVoiceRecords = computed<string[]>(() =>
	Array.isArray(chatApi.selectedVoiceRecords) ? chatApi.selectedVoiceRecords : voiceRecords.value,
)

const activeVoiceRecords = computed<string[]>(() =>
	Array.isArray(chatApi.activeVoiceRecords)
		? chatApi.activeVoiceRecords
		: voiceRecords.value.filter(voice => selectedVoiceRecords.value.includes(voice)),
)

const isVoiceRecordSelected = (voice: string) => selectedVoiceRecords.value.includes(voice)

const setVoiceRecordSelected = (voice: string, selected: boolean) => {
	const handler =
		chatApi.setVoiceRecordSelected ||
		chatApi.setContextVoiceSelected ||
		chatApi.setVoiceSelected ||
		chatApi.setAudioRecordSelected

	if (typeof handler === 'function') {
		handler.call(chat, voice, selected)
	}
}

const removeVoiceRecord = (voice: string) => {
	const handler =
		chatApi.removeVoiceRecord ||
		chatApi.removeContextVoice ||
		chatApi.removeVoice ||
		chatApi.removeAudioRecord

	if (typeof handler === 'function') {
		handler.call(chat, voice)
	}
}

const getProfileValue = (keys: string[]) => {
	const user = props.userProfile?.user || {}

	for (const key of keys) {
		const value = user[key]
		if (value !== undefined && value !== null && value !== '') return value
	}

	return ''
}

const formatDate = (value?: string | number | Date | null) => {
	if (!value) return '—'

	const date = new Date(value)
	if (Number.isNaN(date.getTime())) return '—'

	return date.toLocaleDateString()
}

const formatCounter = (value?: number | null) => Number(value ?? 0)

const formatMoney = (value: unknown) => {
	if (value === undefined || value === null || value === '') return '—'
	if (typeof value === 'number') return `${value}`
	return String(value)
}

const handleOutsidePopupClick = (event: MouseEvent) => {
	const target = event.target as Node | null
	const clickedAvatar = target instanceof HTMLElement ? target.closest('.avatar--button') : null

	if (props.quickContextOpen) {
		const clickedInsideContext = quickContextRef.value?.contains(target)
		if (!clickedInsideContext && !clickedAvatar) closeQuickContext()
	}

	if (props.userProfileOpen) {
		const clickedInsideProfile = userProfileRef.value?.contains(target)
		if (!clickedInsideProfile && !clickedAvatar) closeUserProfile()
	}
}

const renderMessageContent = async () => {
	const content = props.message.content
	const currentToken = ++renderToken

	if (!content) {
		renderedContent.value = ''
		return
	}

	if (!looksLikeMarkdown(props.message)) {
		renderedContent.value = renderPlainText(content)
		return
	}

	renderedContent.value = renderPlainText(content)

	try {
		const renderer = await loadMarkdownRenderer()
		if (currentToken !== renderToken) return
		renderedContent.value = renderer.parse(content)
	} catch (error) {
		if (currentToken !== renderToken) return
		console.warn('markdown render fallback', error)
		renderedContent.value = renderPlainText(content)
	}
}

watch(
	() => [props.message.role, props.message.content] as const,
	() => {
		void renderMessageContent()
	},
	{ immediate: true },
)

const metaSummary = computed(() => {
	const result: string[] = []
	if (props.message.meta?.sourceType) result.push(`Источник: ${props.message.meta.sourceType}`)
	if (props.message.meta?.fileName) result.push(`Файл: ${props.message.meta.fileName}`)
	if (props.message.meta?.statusLabel) result.push(props.message.meta.statusLabel)
	return result
})

const resolvedAudioReplyUrl = computed(() => props.message.meta?.audioReplyUrl || '')

const isQuickContextAvailable = computed(() => props.message.role === 'assistant' && props.quickContextEnabled)
const isQuickContextVisible = computed(() => isQuickContextAvailable.value && props.quickContextOpen)
const isAssistantMessage = computed(() => props.message.role === 'assistant')

const isUserProfileAvailable = computed(() => props.message.role === 'user' && props.userProfileEnabled)
const isUserProfileVisible = computed(() => isUserProfileAvailable.value && props.userProfileOpen)

const quickContextInputId = computed(() => `assistant-quick-context-${props.index}`)
const quickContextPanelId = computed(() => `assistant-quick-context-panel-${props.index}`)
const userProfileId = computed(() => `user-quick-profile-${props.index}`)
const quickContextMode = computed(() => props.quickContextMode)

const isQuickContextFilesMode = computed(() => props.quickContextMode === 'files')
const isQuickContextAudioMode = computed(() => props.quickContextMode === 'audio')
const isQuickContextListMode = computed(() => isQuickContextFilesMode.value || isQuickContextAudioMode.value)

const quickContextPlaceholder = computed(() =>
	props.quickContextMode === 'memory'
		? 'Например: обращайся ко мне на вы, отвечай по делу, учитывай мой стиль работы...'
		: 'Например: отвечай короче, учитывай текущую задачу...',
)

const aiAccess = computed(() => props.userProfile?.aiAccess || null)
const hasActiveAiSubscription = computed(() => isAiSubscriptionActive(aiAccess.value as any))
const aiLimits = computed(() =>
	hasActiveAiSubscription.value ? normalizeAiCounters(aiAccess.value?.limits) : emptyAiCounters(),
)
const aiRemaining = computed(() =>
	hasActiveAiSubscription.value ? normalizeAiCounters(aiAccess.value?.remaining) : emptyAiCounters(),
)
const aiCapabilities = computed(() =>
	hasActiveAiSubscription.value ? buildAiCapabilities(aiLimits.value) : emptyAiCapabilities(),
)

const userDisplayName = computed(() => {
	const directName = getProfileValue(['name', 'displayName', 'fullName', 'username'])
	if (directName) return String(directName)

	const firstName = getProfileValue(['firstName', 'first_name'])
	const lastName = getProfileValue(['lastName', 'last_name'])

	const fullName = `${firstName || ''} ${lastName || ''}`.trim()
	return fullName || 'Пользователь'
})

const userPlanLabel = computed(() => {
	if (hasActiveAiSubscription.value && aiAccess.value?.plan?.name) return aiAccess.value.plan.name
	return 'Нет активного тарифа'
})

const userSubscriptionStatus = computed(() => {
	if (hasActiveAiSubscription.value) return 'active'
	if (aiAccess.value?.subscription?.status) return aiAccess.value.subscription.status
	return 'inactive'
})

const userBalance = computed(() => {
	const userBalanceValue = getProfileValue(['balance', 'money', 'amount'])
	if (userBalanceValue !== '') return formatMoney(userBalanceValue)

	if (aiAccess.value?.balance !== undefined) return formatMoney(aiAccess.value.balance)
	if (aiAccess.value?.account?.balance !== undefined) return formatMoney(aiAccess.value.account.balance)

	return '—'
})

const userProfileRows = computed(() => [
	{ label: 'Авторизация', value: props.userProfile?.isAuthenticated ? 'Выполнена' : 'Гость' },
	{ label: 'ID', value: String(getProfileValue(['id', 'vkId', 'vk_id', 'userId', 'user_id']) || '—') },
	{ label: 'Тариф', value: userPlanLabel.value },
	{ label: 'Статус подписки', value: userSubscriptionStatus.value },
	{ label: 'Доступ до', value: formatDate(aiAccess.value?.subscription?.expiresAt) },
	{ label: 'Баланс', value: userBalance.value },
	{ label: 'Осталось чатов', value: formatCounter(aiRemaining.value.chat) },
	{ label: 'Осталось файлов', value: formatCounter(aiRemaining.value.fileUpload) },
	{ label: 'Осталось голоса', value: formatCounter(aiRemaining.value.voice) },
])

const normalizedQuickContextValue = computed(() => String(props.quickContextValue || '').trim())
const normalizedQuickContextDraft = computed(() =>
	isQuickContextListMode.value
		? ''
		: String(quickContextDraft.value || '')
				.slice(0, props.quickContextMaxLength)
				.trim(),
)

const canSaveQuickContext = computed(
	() =>
		!isQuickContextListMode.value &&
		!props.quickContextSaving &&
		normalizedQuickContextDraft.value !== normalizedQuickContextValue.value,
)

const canClearQuickContext = computed(() =>
	!isQuickContextListMode.value &&
	!props.quickContextSaving &&
	Boolean(normalizedQuickContextDraft.value || normalizedQuickContextValue.value),
)

const copyTitle = computed(() => (copyStatus.value === 'copied' ? 'Скопировано' : 'Копировать'))
const copyAriaLabel = computed(() => (copyStatus.value === 'copied' ? 'Сообщение скопировано' : 'Копировать сообщение'))

const resendTitle = computed(() => (resendStatus.value === 'sent' ? 'Отправлено заново' : 'Отправить заново'))
const resendAriaLabel = computed(() =>
	resendStatus.value === 'sent' ? 'Сообщение отправлено заново' : 'Отправить сообщение заново',
)

const canConfirmEdit = computed(() => {
	const normalized = editText.value.trim()
	return Boolean(normalized) && normalized !== props.message.content.trim() && !props.actionsDisabled
})

const closeActionsMenu = () => {
	areActionsOpen.value = false
}

const toggleActionsMenu = () => {
	areActionsOpen.value = !areActionsOpen.value
}

const toggleQuickContext = () => {
	if (!isQuickContextAvailable.value) return
	closeActionsMenu()
	if (props.userProfileOpen) closeUserProfile()
	emit('toggle-quick-context', { index: props.index })
}

const closeQuickContext = () => {
	emit('close-quick-context', { index: props.index })
}

const switchQuickContextMode = (mode: QuickContextMode) => {
	if (mode === props.quickContextMode) return
	emit('switch-quick-context-mode', { index: props.index, mode })
}

const saveQuickContext = () => {
	if (isQuickContextListMode.value) return
	if (!canSaveQuickContext.value) return

	emit('save-quick-context', {
		index: props.index,
		content: normalizedQuickContextDraft.value,
		mode: props.quickContextMode,
	})
}

const clearQuickContext = () => {
	if (isQuickContextListMode.value) return
	quickContextDraft.value = ''
	if (!canClearQuickContext.value) return

	emit('save-quick-context', {
		index: props.index,
		content: '',
		mode: props.quickContextMode,
	})
}

const toggleUserProfile = () => {
	if (!isUserProfileAvailable.value) return
	closeActionsMenu()
	if (props.quickContextOpen) closeQuickContext()
	emit('toggle-user-profile', { index: props.index })
}

const closeUserProfile = () => {
	emit('close-user-profile', { index: props.index })
}

watch(
	() => [props.quickContextValue, props.quickContextMode] as const,
	value => {
		if (props.quickContextOpen) quickContextDraft.value = value[1] === 'files' || value[1] === 'audio' ? '' : value[0]
	},
)

watch(
	() => props.quickContextOpen,
	async isOpen => {
		if (!isOpen) return

		closeActionsMenu()
		quickContextDraft.value = isQuickContextListMode.value ? '' : props.quickContextValue

		await nextTick()
		if (!isQuickContextListMode.value) {
			quickContextInputRef.value?.focus()
			quickContextInputRef.value?.select()
		}
	},
)

watch(
	() => props.userProfileOpen,
	isOpen => {
		if (!isOpen) return
		closeActionsMenu()
	},
)

watch(
	() => props.message.content,
	value => {
		if (!isEditing.value) editText.value = value
		closeActionsMenu()
	},
)

watch(
	resolvedAudioReplyUrl,
	async value => {
		if (!value) return

		await nextTick()

		try {
			await audioReplyRef.value?.play()
		} catch (error) {
			console.warn('audio autoplay failed', error)
		}
	},
	{ immediate: true },
)

const saveToNotes = () => {
	closeActionsMenu()

	const notesEvent = new CustomEvent('save-to-notes', {
		detail: { text: props.message.content },
	})

	window.dispatchEvent(notesEvent)
	setAssistantActionStatus('Сохранено в заметки')
}

type AssistantPromptAction = 'shorten' | 'improve' | 'continue' | 'vk-post'

const ASSISTANT_PROMPT_PREFIXES: Record<AssistantPromptAction, string> = {
	shorten: 'Сократи этот текст без потери смысла:',
	improve: 'Улучши этот текст, сделай его понятнее и грамотнее:',
	continue: 'Продолжи мысль и дополни ответ:',
	'vk-post': 'Преврати этот текст в готовый пост для VK с заголовком, абзацами и призывом к действию:',
}

const setAssistantActionStatus = (message: string) => {
	if (assistantActionStatusTimer) window.clearTimeout(assistantActionStatusTimer)

	assistantActionStatus.value = message
	assistantActionStatusTimer = window.setTimeout(() => {
		assistantActionStatus.value = ''
		assistantActionStatusTimer = null
	}, 1800)
}

const writeTextFallback = (text: string) => {
	const textarea = document.createElement('textarea')
	textarea.value = text
	textarea.setAttribute('readonly', '')
	textarea.style.position = 'fixed'
	textarea.style.top = '-1000px'
	textarea.style.left = '-1000px'

	document.body.appendChild(textarea)
	textarea.select()

	try {
		const copied = document.execCommand('copy')
		if (!copied) throw new Error('Copy command failed')
	} finally {
		document.body.removeChild(textarea)
	}
}

const showCopiedFeedback = () => {
	if (copyStatusTimer) window.clearTimeout(copyStatusTimer)

	copyStatus.value = 'copied'
	copyStatusTimer = window.setTimeout(() => {
		copyStatus.value = 'idle'
		copyStatusTimer = null
	}, 1400)
}

const showResendFeedback = () => {
	if (resendStatusTimer) window.clearTimeout(resendStatusTimer)

	resendStatus.value = 'sent'
	resendStatusTimer = window.setTimeout(() => {
		resendStatus.value = 'idle'
		resendStatusTimer = null
	}, 1400)
}

const copyMessage = async () => {
	try {
		if (navigator.clipboard?.writeText) {
			await navigator.clipboard.writeText(props.message.content)
		} else {
			writeTextFallback(props.message.content)
		}

		showCopiedFeedback()
	} catch (error) {
		try {
			writeTextFallback(props.message.content)
			showCopiedFeedback()
		} catch (fallbackError) {
			console.warn('copy message failed', fallbackError || error)
		}
	}
}

const copyAssistantResponse = async () => {
	await copyMessage()
	setAssistantActionStatus('Скопировано')
}

const shareAssistantResponse = async () => {
	await copyMessage()
	setAssistantActionStatus('Текст скопирован для отправки')
}

const openPromptAction = (action: AssistantPromptAction) => {
	const prompt = `${ASSISTANT_PROMPT_PREFIXES[action]}\n${props.message.content}`

	localStorage.setItem(HOME_PROMPT_STORAGE_KEY, prompt)
	window.dispatchEvent(new CustomEvent(HOME_PROMPT_EVENT))
	setAssistantActionStatus('Prompt открыт в чате')
}

const startEdit = async () => {
	if (props.actionsDisabled) return

	closeActionsMenu()
	editText.value = props.message.content
	isEditing.value = true

	await nextTick()
	editTextareaRef.value?.focus()
	editTextareaRef.value?.select()
}

const cancelEdit = () => {
	editText.value = props.message.content
	isEditing.value = false
}

const confirmEdit = () => {
	if (!canConfirmEdit.value) return

	const content = editText.value.trim()
	isEditing.value = false

	emit('edit-message', { index: props.index, content })
}

const resendMessage = () => {
	if (props.actionsDisabled) return

	emit('resend-message', { index: props.index, content: props.message.content })
	showResendFeedback()
}

onMounted(() => {
	document.addEventListener('mousedown', handleOutsidePopupClick)
})

onBeforeUnmount(() => {
	document.removeEventListener('mousedown', handleOutsidePopupClick)

	if (copyStatusTimer) window.clearTimeout(copyStatusTimer)
	if (resendStatusTimer) window.clearTimeout(resendStatusTimer)
	if (assistantActionStatusTimer) window.clearTimeout(assistantActionStatusTimer)
})
</script>
