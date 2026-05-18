<template>
	<section v-if="FEATURES.homePage" class="home-panel">
		<div class="home-panel__hero">
			<span class="home-panel__eyebrow">Главная</span>
			<h1>Чем помочь сегодня?</h1>
			<p>
				Выберите готовый сценарий, откройте чат или перейдите к шаблонам. Приложение помогает быстрее писать
				тексты, отвечать клиентам, разбирать файлы и работать с AI-помощником.
			</p>

			<div class="home-panel__actions">
				<button type="button" class="pill-btn pill-btn--active" @click="navigateTo('chat')">Открыть чат</button>
				<button v-if="FEATURES.promptCatalog" type="button" class="pill-btn" @click="navigateTo('prompts')">
					Смотреть шаблоны
				</button>
				<button v-if="FEATURES.tariffsPage" type="button" class="pill-btn" @click="navigateTo('tariffs')">
					Посмотреть тарифы
				</button>
			</div>
		</div>

		<div class="home-panel__section">
			<div class="home-panel__section-head">
				<h2>Быстрые сценарии</h2>
				<span>{{ visibleCards.length }} вариантов</span>
			</div>

			<div class="home-card-grid">
				<button v-for="card in visibleCards" :key="card.id" type="button" class="home-card" @click="handleCardClick(card)">
					<span v-if="card.badge || card.isPremium" class="home-card__badge">
						{{ card.isPremium ? 'Premium' : card.badge }}
					</span>
					<strong>{{ card.title }}</strong>
					<small>{{ card.description }}</small>
				</button>
			</div>
		</div>

		<div class="home-panel__split">
			<div class="home-panel__section home-panel__section--compact">
				<div class="home-panel__section-head">
					<h2>Популярные сценарии</h2>
				</div>
				<div class="home-list">
					<button
						v-for="card in popularCards"
						:key="card.id"
						type="button"
						class="home-list__item"
						@click="handleCardClick(card)"
					>
						<span>{{ card.title }}</span>
						<small>{{ card.badge || 'AI' }}</small>
					</button>
				</div>
			</div>

			<div class="home-panel__section home-panel__section--compact">
				<div class="home-panel__section-head">
					<h2>Возможности приложения</h2>
				</div>
				<div class="home-feature-list">
					<span v-for="feature in appFeatures" :key="feature">{{ feature }}</span>
				</div>
			</div>
		</div>
	</section>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'

import { FEATURES } from '../config/features'
import { HOME_CARDS, HOME_PROMPT_EVENT, HOME_PROMPT_STORAGE_KEY, type HomeCard } from '../data/homeCards'
import { trackEvent } from '../utils/analytics'

const emit = defineEmits<{
	(e: 'navigate', panel: string): void
}>()

const visibleCards = computed(() => HOME_CARDS.filter(card => !card.isHidden))
const popularCards = computed(() => visibleCards.value.slice(0, 4))

const appFeatures = ['AI-чат', 'Голосовые запросы', 'Работа с файлами', 'Заметки', 'AI memory', 'Тарифы']

const navigateTo = (panel: string) => {
	emit('navigate', panel)
}

const openPromptInChat = (prompt: string) => {
	localStorage.setItem(HOME_PROMPT_STORAGE_KEY, prompt)
	emit('navigate', 'chat')
	window.dispatchEvent(new CustomEvent(HOME_PROMPT_EVENT))
}

const handleCardClick = (card: HomeCard) => {
	if (card.prompt) {
		openPromptInChat(card.prompt)
		return
	}

	if (card.targetPanel) {
		emit('navigate', card.targetPanel)
	}
}

onMounted(() => {
	trackEvent('home_opened')
})
</script>
