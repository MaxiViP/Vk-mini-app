<template>
	<div :class="['message', message.role]">
		<div :class="['avatar', `avatar--${message.role}`]" aria-hidden="true">
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

		<div :class="['bubble', { 'bubble--editing': isEditing }]">
			<!-- <div v-if="metaSummary.length" class="meta-row">
				<span v-for="item in metaSummary" :key="item" class="meta-chip">{{ item }}</span>
			</div> -->

			<div v-if="message.meta?.transcript" class="meta-transcript">Распознано: {{ message.meta.transcript }}</div>

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

			<!-- <div v-if="message.meta?.sources?.length" class="source-list">
				<span v-for="source in message.meta.sources" :key="`${source.type}:${source.name}`" class="source-chip">
					{{ source.type }} · {{ source.name }}
				</span>
			</div> -->

			<audio
				v-if="resolvedAudioReplyUrl"
				ref="audioReplyRef"
				class="audio-reply"
				controls
				:src="resolvedAudioReplyUrl"
			></audio>

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
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

import type { Message } from '../../types'

type MarkdownRenderer = {
	parse: (value: string) => string
}

let markdownRendererPromise: Promise<MarkdownRenderer> | null = null

const MARKDOWN_PATTERN =
	/```|`[^`\n]+`|^\s{0,3}#{1,6}\s|^\s*[-*+]\s|^\s*\d+\.\s|^\s*>\s|\[[^\]]+\]\([^)]+\)|(\*\*|__)[^\n]+(\*\*|__)|^\|.+\|/m

const loadMarkdownRenderer = () => {
	if (!markdownRendererPromise) {
		markdownRendererPromise = Promise.all([
			import('marked'),
			import('highlight.js'),
			import('highlight.js/styles/github-dark.css'),
		]).then(([markedModule, hljsModule]) => {
			const { marked } = markedModule
			const hljs = hljsModule.default

			marked.use({
				gfm: true,
				breaks: true,
				renderer: {
					code({ text, lang }) {
						const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext'
						const highlighted = hljs.highlight(text, { language }).value
						return `<pre><code class="hljs language-${language}">${highlighted}</code></pre>`
					},
				},
			})

			return {
				parse: value => marked.parse(value, { async: false }) as string,
			}
		})
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
	}>(),
	{
		index: -1,
		actionsDisabled: false,
	},
)

const emit = defineEmits<{
	(e: 'edit-message', payload: { index: number; content: string }): void
	(e: 'resend-message', payload: { index: number; content: string }): void
}>()

const audioReplyRef = ref<HTMLAudioElement | null>(null)
const editTextareaRef = ref<HTMLTextAreaElement | null>(null)
const renderedContent = ref('')
const isEditing = ref(false)
const areActionsOpen = ref(false)
const editText = ref(props.message.content)
const copyStatus = ref<'idle' | 'copied'>('idle')
const resendStatus = ref<'idle' | 'sent'>('idle')

let renderToken = 0
let copyStatusTimer: number | null = null
let resendStatusTimer: number | null = null

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

onBeforeUnmount(() => {
	if (copyStatusTimer) window.clearTimeout(copyStatusTimer)
	if (resendStatusTimer) window.clearTimeout(resendStatusTimer)
})
</script>
