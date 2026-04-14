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

			<div class="content" v-html="renderedContent"></div>

			<div v-if="message.meta?.sources?.length" class="source-list">
				<span v-for="source in message.meta.sources" :key="`${source.type}:${source.name}`" class="source-chip">
					{{ source.type }} · {{ source.name }}
				</span>
			</div>

			<audio v-if="resolvedAudioReplyUrl" ref="audioReplyRef" class="audio-reply" controls :src="resolvedAudioReplyUrl"></audio>
		</div>

		<button v-if="message.role === 'assistant'" class="save-note" @click="saveToNotes" title="Сохранить в заметки">
			📎
		</button>
	</div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeMount, ref, watch } from 'vue'
import { marked } from 'marked'
import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark.css'

import type { Message } from '../../types'

const props = defineProps<{
	message: Message
	showLimits?: boolean
}>()
const audioReplyRef = ref<HTMLAudioElement | null>(null)

onBeforeMount(() => {
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
})

const renderedContent = computed(() => {
	if (!props.message.content) return ''
	return marked.parse(props.message.content, { async: false }) as string
})

const metaSummary = computed(() => {
	const result: string[] = []
	if (props.message.meta?.sourceType) result.push(`Источник: ${props.message.meta.sourceType}`)
	if (props.message.meta?.fileName) result.push(`Файл: ${props.message.meta.fileName}`)
	if (props.message.meta?.statusLabel) result.push(props.message.meta.statusLabel)
	return result
})

const resolvedAudioReplyUrl = computed(() => props.message.meta?.audioReplyUrl || '')

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
</script>

<style scoped>
.meta-row,
.source-list {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	margin-bottom: 10px;
}

.meta-chip,
.source-chip {
	display: inline-flex;
	align-items: center;
	padding: 5px 8px;
	border-radius: 999px;
	font-size: 11px;
	line-height: 1.2;
}

.meta-chip {
	background: var(--mode-accent-soft);
	border: 1px solid var(--mode-accent-border);
	color: var(--mode-accent-strong);
}

.source-chip {
	background: var(--mode-accent-soft);
	border: 1px solid var(--mode-accent-border);
	color: var(--mode-accent-strong);
}

.meta-transcript {
	margin-bottom: 10px;
	padding: 8px 10px;
	border-radius: 12px;
	background: var(--mode-accent-soft);
	border: 1px solid var(--mode-accent-border);
	color: var(--mode-accent-strong);
	font-size: 13px;
}

.audio-reply {
	width: 100%;
	margin-top: 12px;
	accent-color: var(--mode-accent);
}
</style>
