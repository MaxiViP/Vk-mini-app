<template>
	<section v-if="FEATURES.aiTools" class="tools-panel">
		<div class="tools-panel__hero">
			<span class="tools-panel__eyebrow">Инструменты</span>
			<h1>AI-инструменты</h1>
			<p>
				Быстрые формы для типовых задач. Введите исходный текст или описание, а инструмент соберет prompt
				и откроет его в чате без подключения нового backend.
			</p>
		</div>

		<div class="tools-toolbar">
			<label class="tools-search">
				<span>Поиск</span>
				<input v-model="searchQuery" type="search" placeholder="Название, описание или категория" />
			</label>

			<div class="tools-categories" role="tablist" aria-label="Категории AI-инструментов">
				<button
					v-for="category in AI_TOOL_CATEGORIES"
					:key="category"
					type="button"
					:class="['tools-category', { 'tools-category--active': selectedCategory === category }]"
					@click="selectedCategory = category"
				>
					{{ category }}
				</button>
			</div>
		</div>

		<div class="tools-panel__summary">
			<span>Найдено: {{ filteredTools.length }}</span>
			<span v-if="statusMessage">{{ statusMessage }}</span>
		</div>

		<div v-if="filteredTools.length" class="tool-grid">
			<article v-for="tool in filteredTools" :key="tool.id" class="tool-card">
				<div class="tool-card__badges">
					<span class="tool-card__badge">{{ tool.category }}</span>
					<span v-if="tool.isPremium" class="tool-card__badge tool-card__badge--premium">Premium</span>
				</div>

				<h2>{{ tool.title }}</h2>
				<p>{{ tool.description }}</p>

				<label class="tool-card__input">
					<span>{{ tool.inputLabel }}</span>
					<textarea
						:value="getToolInput(tool.id)"
						:placeholder="tool.placeholder"
						rows="5"
						@input="updateToolInput(tool.id, $event)"
					></textarea>
				</label>

				<div class="tool-card__actions">
					<button
						type="button"
						class="pill-btn pill-btn--active"
						:disabled="!hasToolInput(tool.id)"
						@click="openInChat(tool)"
					>
						Сгенерировать
					</button>
					<button type="button" class="pill-btn" :disabled="!hasToolInput(tool.id)" @click="openInChat(tool)">
						Открыть в чате
					</button>
					<button type="button" class="pill-btn" :disabled="!hasToolInput(tool.id)" @click="copyPrompt(tool)">
						Скопировать prompt
					</button>
				</div>
			</article>
		</div>

		<div v-else class="tools-empty">
			<h2>Ничего не найдено</h2>
			<p>Попробуйте изменить запрос или выбрать другую категорию.</p>
		</div>
	</section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'

import { FEATURES } from '../config/features'
import { AI_TOOL_CATEGORIES, AI_TOOLS, type AiTool } from '../data/aiTools'
import { HOME_PROMPT_EVENT, HOME_PROMPT_STORAGE_KEY } from '../data/homeCards'
import { trackEvent } from '../utils/analytics'

const emit = defineEmits<{
	(e: 'navigate', panel: string): void
}>()

const searchQuery = ref('')
const selectedCategory = ref<(typeof AI_TOOL_CATEGORIES)[number]>('Все')
const toolInputs = ref<Record<string, string>>({})
const statusMessage = ref('')

let statusTimer: number | null = null

const normalizeText = (value: string) => value.trim().toLowerCase()

const filteredTools = computed(() => {
	const query = normalizeText(searchQuery.value)

	return AI_TOOLS.filter(tool => {
		if (tool.isHidden) return false
		if (selectedCategory.value !== 'Все' && tool.category !== selectedCategory.value) return false
		if (!query) return true

		const searchableText = `${tool.title} ${tool.description} ${tool.category}`.toLowerCase()
		return searchableText.includes(query)
	})
})

const setStatus = (message: string) => {
	if (statusTimer) window.clearTimeout(statusTimer)

	statusMessage.value = message
	statusTimer = window.setTimeout(() => {
		statusMessage.value = ''
		statusTimer = null
	}, 1800)
}

const getToolInput = (toolId: string) => toolInputs.value[toolId] || ''

const hasToolInput = (toolId: string) => Boolean(getToolInput(toolId).trim())

const updateToolInput = (toolId: string, event: Event) => {
	const value = (event.target as HTMLTextAreaElement).value
	toolInputs.value = {
		...toolInputs.value,
		[toolId]: value,
	}
}

const buildPrompt = (tool: AiTool) => `${tool.promptPrefix}\n\n${getToolInput(tool.id).trim()}`

const fallbackCopy = (value: string) => {
	const textarea = document.createElement('textarea')
	textarea.value = value
	textarea.setAttribute('readonly', '')
	textarea.style.position = 'fixed'
	textarea.style.top = '-1000px'
	textarea.style.left = '-1000px'
	document.body.appendChild(textarea)
	textarea.select()

	try {
		if (!document.execCommand('copy')) throw new Error('Copy command failed')
		setStatus('Prompt скопирован')
	} catch {
		setStatus('Не удалось скопировать prompt')
	} finally {
		document.body.removeChild(textarea)
	}
}

const copyPrompt = async (tool: AiTool) => {
	if (!hasToolInput(tool.id)) {
		setStatus('Введите текст для инструмента')
		return
	}

	const prompt = buildPrompt(tool)

	try {
		if (navigator.clipboard?.writeText) {
			await navigator.clipboard.writeText(prompt)
			setStatus('Prompt скопирован')
			return
		}

		fallbackCopy(prompt)
	} catch {
		fallbackCopy(prompt)
	}
}

const openInChat = (tool: AiTool) => {
	if (!hasToolInput(tool.id)) {
		setStatus('Введите текст для инструмента')
		return
	}

	trackEvent('tool_used', { toolId: tool.id, category: tool.category })
	localStorage.setItem(HOME_PROMPT_STORAGE_KEY, buildPrompt(tool))
	emit('navigate', 'chat')
	window.dispatchEvent(new CustomEvent(HOME_PROMPT_EVENT))
}

onBeforeUnmount(() => {
	if (statusTimer) window.clearTimeout(statusTimer)
})
</script>
