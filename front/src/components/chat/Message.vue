<template>
	<div :class="['message', message.role]">
		<div class="avatar">{{ message.role === 'user' ? '👤' : '🤖' }}</div>

		<div class="bubble">
			<div v-if="metaSummary.length" class="meta-row">
				<span v-for="item in metaSummary" :key="item" class="meta-chip">{{ item }}</span>
			</div>

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

			<div v-if="message.meta?.sources?.length" class="source-list">
				<span v-for="source in message.meta.sources" :key="`${source.type}:${source.name}`" class="source-chip">
					{{ source.type }} · {{ source.name }}
				</span>
			</div>

			<audio v-if="resolvedAudioReplyUrl" ref="audioReplyRef" class="audio-reply" controls :src="resolvedAudioReplyUrl"></audio>

			<div v-if="!isEditing" class="message-actions">
				<button
					class="message-action"
					:class="{ 'message-action--success': copyStatus === 'copied' }"
					type="button"
					@click="copyMessage"
					:title="copyTitle"
					:aria-label="copyAriaLabel"
				>
					<span :key="copyStatus" class="message-action__icon">{{ copyLabel }}</span>
				</button>

				<button
					v-if="message.role === 'assistant'"
					class="message-action save-note"
					type="button"
					@click="saveToNotes"
					title="Сохранить в заметки"
					aria-label="Сохранить ответ в заметки"
				>
					📎
				</button>

				<template v-if="message.role === 'user'">
					<button
						class="message-action"
						type="button"
						@click="startEdit"
						:disabled="actionsDisabled"
						title="Изменить"
						aria-label="Изменить сообщение"
					>
						✏️
					</button>

					<button
						class="message-action"
						:class="{ 'message-action--success': resendStatus === 'sent' }"
						type="button"
						@click="resendMessage"
						:disabled="actionsDisabled"
						:title="resendTitle"
						:aria-label="resendAriaLabel"
					>
						<span :key="resendStatus" class="message-action__icon">{{ resendLabel }}</span>
					</button>
				</template>
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

const props = withDefaults(defineProps<{
	message: Message
	index?: number
	showLimits?: boolean
	actionsDisabled?: boolean
}>(), {
	index: -1,
	actionsDisabled: false,
})

const emit = defineEmits<{
	(e: 'edit-message', payload: { index: number; content: string }): void
	(e: 'resend-message', payload: { index: number; content: string }): void
}>()

const audioReplyRef = ref<HTMLAudioElement | null>(null)
const editTextareaRef = ref<HTMLTextAreaElement | null>(null)
const renderedContent = ref('')
const isEditing = ref(false)
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
const copyLabel = computed(() => (copyStatus.value === 'copied' ? '✅ Скопировано' : '📋'))
const copyTitle = computed(() => (copyStatus.value === 'copied' ? 'Скопировано' : 'Копировать'))
const copyAriaLabel = computed(() => (copyStatus.value === 'copied' ? 'Сообщение скопировано' : 'Копировать сообщение'))

const resendLabel = computed(() => (resendStatus.value === 'sent' ? '🚀 Отправлено' : '🔁'))
const resendTitle = computed(() => (resendStatus.value === 'sent' ? 'Отправлено заново' : 'Отправить заново'))
const resendAriaLabel = computed(() => (resendStatus.value === 'sent' ? 'Сообщение отправлено заново' : 'Отправить сообщение заново'))

const canConfirmEdit = computed(() => {
	const normalized = editText.value.trim()
	return Boolean(normalized) && normalized !== props.message.content.trim() && !props.actionsDisabled
})

watch(
	() => props.message.content,
	value => {
		if (!isEditing.value) editText.value = value
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