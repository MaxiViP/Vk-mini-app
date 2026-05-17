<template>
	<section v-if="FEATURES.promptCatalog" class="prompts-panel">
		<div class="prompts-panel__hero">
			<span class="prompts-panel__eyebrow">Шаблоны</span>
			<h1>Шаблоны</h1>
			<p>Готовые AI-промпты для VK, учебы, работы, бизнеса, кода, текстов и файлов. Ищите шаблон, копируйте prompt или открывайте его сразу в чате.</p>
		</div>

		<div class="prompts-toolbar">
			<label class="prompts-search">
				<span>Поиск</span>
				<input v-model="searchQuery" type="search" placeholder="Название или описание" />
			</label>

			<div class="prompts-categories" role="tablist" aria-label="Категории шаблонов">
				<button
					v-for="category in PROMPT_CATEGORIES"
					:key="category"
					type="button"
					:class="['prompts-category', { 'prompts-category--active': selectedCategory === category }]"
					@click="selectedCategory = category"
				>
					{{ category }}
				</button>
			</div>
		</div>

		<div class="prompts-panel__summary">
			<span>Найдено: {{ filteredTemplates.length }}</span>
			<span v-if="copyStatus">{{ copyStatus }}</span>
		</div>

		<div v-if="filteredTemplates.length" class="prompt-grid">
			<article v-for="template in filteredTemplates" :key="template.id" class="prompt-card">
				<div class="prompt-card__badges">
					<span class="prompt-card__badge">{{ template.category }}</span>
					<span v-if="template.isPremium" class="prompt-card__badge prompt-card__badge--premium">Premium</span>
				</div>

				<h2>{{ template.title }}</h2>
				<p>{{ template.description }}</p>

				<div class="prompt-card__actions">
					<button type="button" class="pill-btn pill-btn--active" @click="openInChat(template.prompt)">
						Открыть в чате
					</button>
					<button type="button" class="pill-btn" @click="copyPrompt(template.prompt)">Скопировать</button>
				</div>
			</article>
		</div>

		<div v-else class="prompts-empty">
			<h2>Ничего не найдено</h2>
			<p>Попробуйте изменить запрос или выбрать другую категорию.</p>
		</div>
	</section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'

import { FEATURES } from '../config/features'
import { HOME_PROMPT_EVENT, HOME_PROMPT_STORAGE_KEY } from '../data/homeCards'
import { PROMPT_CATEGORIES, PROMPT_TEMPLATES } from '../data/promptTemplates'

const emit = defineEmits<{
	(e: 'navigate', panel: string): void
}>()

const searchQuery = ref('')
const selectedCategory = ref<(typeof PROMPT_CATEGORIES)[number]>('Все')
const copyStatus = ref('')

let copyStatusTimer: number | null = null

const normalizeText = (value: string) => value.trim().toLowerCase()

const filteredTemplates = computed(() => {
	const query = normalizeText(searchQuery.value)

	return PROMPT_TEMPLATES.filter(template => {
		if (template.isHidden) return false
		if (selectedCategory.value !== 'Все' && template.category !== selectedCategory.value) return false
		if (!query) return true

		const searchableText = `${template.title} ${template.description} ${template.category}`.toLowerCase()
		return searchableText.includes(query)
	})
})

const setCopyStatus = (message: string) => {
	if (copyStatusTimer) window.clearTimeout(copyStatusTimer)

	copyStatus.value = message
	copyStatusTimer = window.setTimeout(() => {
		copyStatus.value = ''
		copyStatusTimer = null
	}, 1800)
}

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
		setCopyStatus('Prompt скопирован')
	} catch {
		setCopyStatus('Не удалось скопировать prompt')
	} finally {
		document.body.removeChild(textarea)
	}
}

const copyPrompt = async (prompt: string) => {
	try {
		if (navigator.clipboard?.writeText) {
			await navigator.clipboard.writeText(prompt)
			setCopyStatus('Prompt скопирован')
			return
		}

		fallbackCopy(prompt)
	} catch {
		fallbackCopy(prompt)
	}
}

const openInChat = (prompt: string) => {
	localStorage.setItem(HOME_PROMPT_STORAGE_KEY, prompt)
	emit('navigate', 'chat')
	window.dispatchEvent(new CustomEvent(HOME_PROMPT_EVENT))
}

onBeforeUnmount(() => {
	if (copyStatusTimer) window.clearTimeout(copyStatusTimer)
})
</script>
