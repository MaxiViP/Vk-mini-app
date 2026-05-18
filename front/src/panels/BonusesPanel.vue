<template>
	<section v-if="FEATURES.bonuses" class="bonuses-panel">
		<div class="bonuses-panel__hero">
			<span class="bonuses-panel__eyebrow">Бонусы</span>
			<h1>Бонусы</h1>
			<p>Выполняйте задания и следите за будущими бонусами. Сейчас это UI-заглушка без реальных начислений и backend-запросов.</p>
		</div>

		<div class="bonuses-balance">
			<div>
				<span class="bonuses-balance__label">Баланс бонусов</span>
				<strong>0 AI-запросов</strong>
				<p>Реальный баланс появится после подключения backend.</p>
			</div>
			<div class="bonuses-balance__stats">
				<span>Доступно заданий: {{ availableTasksCount }}</span>
				<span>Получено наград: {{ completedTasksCount }}</span>
				<span>Скоро: {{ lockedTasksCount }}</span>
			</div>
		</div>

		<div class="bonuses-section">
			<div class="bonuses-section__head">
				<div>
					<h2>Задания</h2>
					<span>Стартовые и социальные действия для будущей бонусной системы</span>
				</div>
				<span class="bonuses-section__count">{{ regularTasks.length }}</span>
			</div>

			<div class="bonus-task-list">
				<article v-for="task in regularTasks" :key="task.id" class="bonus-task-card">
					<div class="bonus-task-card__content">
						<div class="bonus-task-card__badges">
							<span :class="['bonus-task-card__status', `bonus-task-card__status--${task.status}`]">
								{{ getStatusLabel(task.status) }}
							</span>
							<span class="bonus-task-card__category">{{ getCategoryLabel(task.category) }}</span>
						</div>
						<h3>{{ task.title }}</h3>
						<p>{{ task.description }}</p>
					</div>
					<div class="bonus-task-card__side">
						<strong>{{ task.reward }}</strong>
						<button type="button" class="pill-btn" :disabled="task.status !== 'available'">
							{{ getActionLabel(task.status) }}
						</button>
					</div>
				</article>
			</div>
		</div>

		<div v-if="FEATURES.dailyTasks" class="bonuses-section">
			<div class="bonuses-section__head">
				<div>
					<h2>Ежедневные задания</h2>
					<span>Повторяемые активности будут обновляться после подключения backend</span>
				</div>
				<span class="bonuses-section__count">{{ dailyTasks.length }}</span>
			</div>

			<div class="bonus-task-list">
				<article v-for="task in dailyTasks" :key="task.id" class="bonus-task-card">
					<div class="bonus-task-card__content">
						<div class="bonus-task-card__badges">
							<span :class="['bonus-task-card__status', `bonus-task-card__status--${task.status}`]">
								{{ getStatusLabel(task.status) }}
							</span>
							<span class="bonus-task-card__category">{{ getCategoryLabel(task.category) }}</span>
						</div>
						<h3>{{ task.title }}</h3>
						<p>{{ task.description }}</p>
					</div>
					<div class="bonus-task-card__side">
						<strong>{{ task.reward }}</strong>
						<button type="button" class="pill-btn" :disabled="task.status !== 'available'">
							{{ getActionLabel(task.status) }}
						</button>
					</div>
				</article>
			</div>
		</div>

		<div v-if="FEATURES.referrals" class="bonuses-section bonuses-referral">
			<div class="bonuses-section__head">
				<div>
					<h2>Рефералы</h2>
					<span>{{ REFERRAL_INFO.title }}</span>
				</div>
			</div>

			<p>{{ REFERRAL_INFO.description }}</p>
			<div class="bonuses-referral__rewards">
				<span>Вам: {{ REFERRAL_INFO.inviterReward }}</span>
				<span>Другу: {{ REFERRAL_INFO.friendReward }}</span>
			</div>
			<div class="bonuses-referral__link" aria-label="Реферальная ссылка">
				<span>{{ referralLink }}</span>
			</div>
			<div class="bonuses-referral__actions">
				<button type="button" class="pill-btn pill-btn--active" @click="copyReferralLink">
					Скопировать ссылку
				</button>
				<button v-if="FEATURES.sharing" type="button" class="pill-btn" @click="shareReferralLink">
					Поделиться
				</button>
			</div>
			<span v-if="copyStatus" class="bonuses-copy-status">{{ copyStatus }}</span>
		</div>
	</section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { FEATURES } from '../config/features'
import { BONUS_TASKS, REFERRAL_INFO, type BonusTask } from '../data/bonusTasks'
import { trackEvent } from '../utils/analytics'

const copyStatus = ref('')
let copyStatusTimer: number | null = null

const visibleTasks = computed(() => BONUS_TASKS.filter(task => !task.isHidden))
const regularTasks = computed(() => visibleTasks.value.filter(task => task.category !== 'daily'))
const dailyTasks = computed(() => visibleTasks.value.filter(task => task.category === 'daily'))

const availableTasksCount = computed(() => visibleTasks.value.filter(task => task.status === 'available').length)
const completedTasksCount = computed(() => visibleTasks.value.filter(task => task.status === 'completed').length)
const lockedTasksCount = computed(() => visibleTasks.value.filter(task => task.status === 'locked').length)

const referralLink = computed(() => {
	if (typeof window !== 'undefined' && window.location.href) return window.location.href
	return REFERRAL_INFO.linkPlaceholder
})

const getStatusLabel = (status: BonusTask['status']) => {
	if (status === 'completed') return 'Получено'
	if (status === 'locked') return 'Скоро'
	return 'Доступно'
}

const getActionLabel = (status: BonusTask['status']) => {
	if (status === 'completed') return 'Получено'
	if (status === 'locked') return 'Скоро'
	return 'Выполнить'
}

const getCategoryLabel = (category: BonusTask['category']) => {
	if (category === 'daily') return 'Ежедневное'
	if (category === 'social') return 'Социальное'
	if (category === 'premium') return 'Premium'
	return 'Старт'
}

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
		setCopyStatus('Ссылка скопирована')
	} catch {
		setCopyStatus('Не удалось скопировать ссылку')
	} finally {
		document.body.removeChild(textarea)
	}
}

const copyValue = async (value: string) => {
	try {
		if (navigator.clipboard?.writeText) {
			await navigator.clipboard.writeText(value)
			setCopyStatus('Ссылка скопирована')
			return
		}

		fallbackCopy(value)
	} catch {
		fallbackCopy(value)
	}
}

const copyReferralLink = () => {
	trackEvent('referral_shared', { method: 'copy' })
	void copyValue(referralLink.value || REFERRAL_INFO.linkPlaceholder)
}

const shareReferralLink = async () => {
	const text = referralLink.value || REFERRAL_INFO.linkPlaceholder

	if (navigator.share) {
		try {
			await navigator.share({
				title: REFERRAL_INFO.title,
				text: REFERRAL_INFO.description,
				url: text,
			})
			trackEvent('referral_shared', { method: 'share' })
			return
		} catch {
			setCopyStatus('Не удалось открыть системный шаринг')
		}
	}

	trackEvent('referral_shared', { method: 'copy_fallback' })
	void copyValue(text)
}

onMounted(() => {
	trackEvent('bonus_opened')
})
</script>
