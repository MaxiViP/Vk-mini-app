<template>
	<section v-if="FEATURES.changelog" class="changelog-panel">
		<div class="changelog-panel__hero">
			<span class="changelog-panel__eyebrow">Обновления</span>
			<h1>Обновления</h1>
			<p>История изменений приложения: новые возможности, улучшения, исправления и платежные обновления.</p>
		</div>

		<div class="changelog-filter" role="tablist" aria-label="Фильтр обновлений">
			<button
				v-for="filter in changelogFilters"
				:key="filter.value"
				type="button"
				:class="['changelog-filter__button', { 'changelog-filter__button--active': selectedType === filter.value }]"
				@click="selectedType = filter.value"
			>
				{{ filter.label }}
			</button>
		</div>

		<div class="changelog-list">
			<article v-for="item in filteredItems" :key="item.id" class="changelog-card">
				<div class="changelog-card__meta">
					<span :class="['changelog-card__badge', `changelog-card__badge--${item.type}`]">{{ item.type }}</span>
					<time :datetime="item.date">{{ formatDate(item.date) }}</time>
				</div>
				<h2>{{ item.title }}</h2>
				<p>{{ item.description }}</p>
			</article>
		</div>
	</section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { FEATURES } from '../config/features'
import { CHANGELOG_ITEMS, type ChangelogItem } from '../data/changelog'
import { trackEvent } from '../utils/analytics'

type ChangelogFilter = ChangelogItem['type'] | 'all'

const selectedType = ref<ChangelogFilter>('all')

const changelogFilters: Array<{ value: ChangelogFilter; label: string }> = [
	{ value: 'all', label: 'Все' },
	{ value: 'feature', label: 'feature' },
	{ value: 'fix', label: 'fix' },
	{ value: 'improvement', label: 'improvement' },
	{ value: 'billing', label: 'billing' },
]

const filteredItems = computed(() => {
	if (selectedType.value === 'all') return CHANGELOG_ITEMS
	return CHANGELOG_ITEMS.filter(item => item.type === selectedType.value)
})

const formatDate = (value: string) => new Date(value).toLocaleDateString('ru-RU')

onMounted(() => {
	trackEvent('changelog_opened')
})
</script>
