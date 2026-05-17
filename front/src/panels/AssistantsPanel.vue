<template>
	<section v-if="FEATURES.assistants" class="assistants-panel">
		<div class="assistants-panel__hero">
			<span class="assistants-panel__eyebrow">Ассистенты</span>
			<h1>Ассистенты</h1>
			<p>
				Выберите роль AI для типовой задачи. На этом этапе ассистент сохраняется во frontend-состоянии
				и подставляет intro-prompt в чат без изменения backend system prompt.
			</p>
		</div>

		<div class="assistants-toolbar">
			<label class="assistants-search">
				<span>Поиск</span>
				<input v-model="searchQuery" type="search" placeholder="Название, описание или категория" />
			</label>

			<div class="assistants-categories" role="tablist" aria-label="Категории ассистентов">
				<button
					v-for="category in ASSISTANT_CATEGORIES"
					:key="category"
					type="button"
					:class="['assistants-category', { 'assistants-category--active': selectedCategory === category }]"
					@click="selectedCategory = category"
				>
					{{ category }}
				</button>
			</div>
		</div>

		<div class="assistants-panel__summary">
			<span>Найдено: {{ filteredAssistants.length }}</span>
			<span v-if="selectedAssistant">Выбран: {{ selectedAssistant.title }}</span>
		</div>

		<div v-if="filteredAssistants.length" class="assistant-grid">
			<article
				v-for="assistant in filteredAssistants"
				:key="assistant.id"
				:class="['assistant-card', { 'assistant-card--selected': selectedAssistantId === assistant.id }]"
			>
				<div class="assistant-card__badges">
					<span class="assistant-card__badge">{{ assistant.category }}</span>
					<span v-if="assistant.isPremium" class="assistant-card__badge assistant-card__badge--premium">Premium</span>
					<span v-if="selectedAssistantId === assistant.id" class="assistant-card__badge assistant-card__badge--active">
						Выбран
					</span>
				</div>

				<h2>{{ assistant.title }}</h2>
				<p>{{ assistant.description }}</p>

				<div class="assistant-card__prompt">
					<span>Инструкция</span>
					<p>{{ assistant.systemPrompt }}</p>
				</div>

				<div class="assistant-card__actions">
					<button type="button" class="pill-btn" @click="selectAssistant(assistant)">
						Выбрать
					</button>
					<button type="button" class="pill-btn pill-btn--active" @click="startChat(assistant)">
						Начать чат
					</button>
				</div>
			</article>
		</div>

		<div v-else class="assistants-empty">
			<h2>Ничего не найдено</h2>
			<p>Попробуйте изменить запрос или выбрать другую категорию.</p>
		</div>
	</section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

import { FEATURES } from '../config/features'
import { ASSISTANT_CATEGORIES, ASSISTANT_PRESETS, type AssistantPreset } from '../data/assistantPresets'
import { HOME_PROMPT_EVENT, HOME_PROMPT_STORAGE_KEY } from '../data/homeCards'
import { useAssistantsStore } from '../stores/assistants'

const emit = defineEmits<{
	(e: 'navigate', panel: string): void
}>()

const assistantsStore = useAssistantsStore()
const searchQuery = ref('')
const selectedCategory = ref<(typeof ASSISTANT_CATEGORIES)[number]>('Все')

const selectedAssistantId = computed(() => assistantsStore.selectedAssistantId)
const selectedAssistant = computed(() => assistantsStore.selectedAssistant)

const normalizeText = (value: string) => value.trim().toLowerCase()

const filteredAssistants = computed(() => {
	const query = normalizeText(searchQuery.value)

	return ASSISTANT_PRESETS.filter(assistant => {
		if (assistant.isHidden) return false
		if (selectedCategory.value !== 'Все' && assistant.category !== selectedCategory.value) return false
		if (!query) return true

		const searchableText = `${assistant.title} ${assistant.description} ${assistant.category}`.toLowerCase()
		return searchableText.includes(query)
	})
})

const buildIntroPrompt = (assistant: AssistantPreset) =>
	`Ты теперь работаешь как ассистент: ${assistant.title}.\n\nИнструкция:\n${assistant.systemPrompt}\n\nНачни с того, что кратко спроси, с какой задачей помочь.`

const selectAssistant = (assistant: AssistantPreset) => {
	assistantsStore.selectAssistant(assistant.id)
}

const startChat = (assistant: AssistantPreset) => {
	selectAssistant(assistant)
	localStorage.setItem(HOME_PROMPT_STORAGE_KEY, buildIntroPrompt(assistant))
	emit('navigate', 'chat')
	window.dispatchEvent(new CustomEvent(HOME_PROMPT_EVENT))
}
</script>
