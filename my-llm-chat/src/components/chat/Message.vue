<template>
	<div :class="['message', message.role]">
		<div class="avatar">{{ message.role === 'user' ? '👤' : '🤖' }}</div>

		<div class="bubble">
			<div class="content" v-html="renderedContent"></div>
		</div>

		<button v-if="message.role === 'assistant'" class="save-note" @click="saveToNotes" title="Сохранить в заметки">
			📎
		</button>
	</div>
</template>

<script setup lang="ts">
import { computed, onBeforeMount } from 'vue'
import { marked } from 'marked'
import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark.css'

const props = defineProps<{
	message: { role: 'user' | 'assistant'; content: string }
	showLimits?: boolean
}>()

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

const saveToNotes = () => {
	const notesEvent = new CustomEvent('save-to-notes', {
		detail: { text: props.message.content },
	})
	window.dispatchEvent(notesEvent)
}
</script>
