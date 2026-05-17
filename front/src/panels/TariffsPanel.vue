<template>
	<section v-if="FEATURES.tariffsPage" class="tariffs-panel">
		<div class="tariffs-panel__hero">
			<span class="tariffs-panel__eyebrow">Тарифы</span>
			<h1>Тарифы</h1>
			<p>Выберите подходящий формат работы с AI-чатом. Покупка и применение промокодов остаются в существующем профиле, чтобы не менять текущую бизнес-логику оплат.</p>
		</div>

		<div class="tariffs-current">
			<div>
				<span class="tariffs-current__label">Текущий тариф</span>
				<strong>{{ currentPlanTitle }}</strong>
				<p>{{ currentPlanDescription }}</p>
			</div>

			<div class="tariffs-current__stats">
				<span>Chat requests: {{ currentLimits.chat }}</span>
				<span>Voice requests: {{ currentLimits.voice }}</span>
				<span>File uploads: {{ currentLimits.files }}</span>
			</div>
		</div>

		<div class="tariff-grid">
			<article
				v-for="plan in visibleTariffs"
				:key="plan.id"
				:class="['tariff-card', { 'tariff-card--popular': plan.isPopular, 'tariff-card--current': plan.isCurrent }]"
			>
				<div class="tariff-card__head">
					<span v-if="plan.badge" class="tariff-card__badge">{{ plan.badge }}</span>
					<span v-if="plan.isCurrent" class="tariff-card__status">Активен</span>
				</div>

				<h2>{{ plan.title }}</h2>
				<p>{{ plan.description }}</p>
				<strong class="tariff-card__price">{{ plan.price }}</strong>

				<div class="tariff-limits" aria-label="Лимиты тарифа">
					<span>Chat: {{ plan.limits.chat }}</span>
					<span>Voice: {{ plan.limits.voice }}</span>
					<span>Files: {{ plan.limits.files }}</span>
				</div>

				<ul>
					<li v-for="feature in plan.features" :key="feature">{{ feature }}</li>
				</ul>

				<button type="button" class="tariff-card__button" disabled>
					{{ plan.isCurrent ? 'Текущий тариф' : 'Скоро' }}
				</button>
			</article>
		</div>

		<div class="tariffs-section">
			<div class="tariffs-section__head">
				<h2>Сравнение возможностей</h2>
				<span>Лимиты указаны как ориентир для интерфейса</span>
			</div>

			<div class="tariff-compare">
				<div class="tariff-compare__row tariff-compare__row--head">
					<span>Возможность</span>
					<span v-for="plan in visibleTariffs" :key="plan.id">{{ plan.title }}</span>
				</div>
				<div v-for="row in comparisonRows" :key="row.label" class="tariff-compare__row">
					<span>{{ row.label }}</span>
					<span v-for="value in row.values" :key="value">{{ value }}</span>
				</div>
			</div>
		</div>

		<div class="tariffs-split">
			<div class="tariffs-section">
				<div class="tariffs-section__head">
					<h2>Промокод</h2>
					<span v-if="hasPromoLogic">Логика уже есть в профиле</span>
				</div>

				<div class="tariffs-promo">
					<input type="text" placeholder="Промокод" disabled />
					<button type="button" disabled>Применить в профиле</button>
					<p>Проверка промокода и покупка тарифа не запускаются с этой страницы, чтобы не менять существующий payment flow.</p>
				</div>
			</div>

			<div class="tariffs-section">
				<div class="tariffs-section__head">
					<h2>История оплат</h2>
					<span>{{ recentPayments.length ? 'Последние платежи' : 'Нет данных' }}</span>
				</div>

				<ul v-if="recentPayments.length" class="tariffs-history">
					<li v-for="payment in recentPayments" :key="payment.id">
						<strong>{{ paymentTitle(payment) }}</strong>
						<span>{{ paymentAmountLabel(payment) }} · {{ formatDate(payment.createdAt) }}</span>
					</li>
				</ul>
				<p v-else class="tariffs-empty-text">История появится здесь, когда она будет доступна в профиле.</p>
			</div>
		</div>
	</section>
</template>

<script setup lang="ts">
import { computed } from 'vue'

import { FEATURES } from '../config/features'
import { TARIFF_PLANS } from '../data/tariffs'
import { useUserStore } from '../stores/user'
import type { BillingPayment } from '../types'

const userStore = useUserStore()

const activeSubscription = computed(() => userStore.activeSubscription)
const aiAccess = computed(() => userStore.aiAccess)
const isAiSubscriptionActive = computed(() => userStore.isAiSubscriptionActive)
const recentPayments = computed(() => (userStore.billing?.recentPayments || []).slice(0, 5))
const hasPromoLogic = computed(() => Boolean(userStore.previewSubscriptionPurchase))

const currentPlanTitle = computed(() => {
	if (isAiSubscriptionActive.value && aiAccess.value?.plan) return aiAccess.value.plan.name
	if (activeSubscription.value?.plan) return activeSubscription.value.plan.name
	return 'Бесплатный'
})

const currentPlanDescription = computed(() => {
	if (isAiSubscriptionActive.value && aiAccess.value?.subscription?.expiresAt) {
		return `AI-подписка действует до ${formatDate(aiAccess.value.subscription.expiresAt)}.`
	}

	if (activeSubscription.value?.expiresAt) {
		return `Подписка действует до ${formatDate(activeSubscription.value.expiresAt)}.`
	}

	return 'Активной подписки нет. Доступны базовые возможности и оплата по факту, если она включена в профиле.'
})

const formatCounter = (value?: number | null) => {
	if (value === null || value === undefined) return '0'
	return String(value)
}

const currentLimits = computed(() => {
	if (isAiSubscriptionActive.value && aiAccess.value) {
		return {
			chat: formatCounter(aiAccess.value.remaining.chat),
			voice: formatCounter(aiAccess.value.remaining.voice),
			files: formatCounter(aiAccess.value.remaining.fileUpload),
		}
	}

	if (activeSubscription.value) {
		return {
			chat: formatCounter(activeSubscription.value.remainingRequests),
			voice: 'не задано',
			files: 'не задано',
		}
	}

	return {
		chat: formatCounter(userStore.billing?.usageSnapshot.remainingIncludedRequests),
		voice: 'нет',
		files: 'нет',
	}
})

const visibleTariffs = computed(() =>
	TARIFF_PLANS.filter(plan => !plan.isHidden).map(plan => ({
		...plan,
		isCurrent: plan.id === 'free' && !activeSubscription.value && !isAiSubscriptionActive.value,
	})),
)

const comparisonRows = computed(() => [
	{
		label: 'Chat requests',
		values: visibleTariffs.value.map(plan => plan.limits.chat),
	},
	{
		label: 'Voice requests',
		values: visibleTariffs.value.map(plan => plan.limits.voice),
	},
	{
		label: 'File uploads',
		values: visibleTariffs.value.map(plan => plan.limits.files),
	},
	{
		label: 'Покупка',
		values: visibleTariffs.value.map(plan => (plan.id === 'free' ? 'Не нужна' : 'Через профиль')),
	},
])

const formatDate = (value: string) => new Date(value).toLocaleDateString()
const formatMoney = (value: number) => `${value.toLocaleString('ru-RU')} ₽`

const paymentTitle = (payment: BillingPayment) => {
	if (payment.status === 'succeeded') return 'Платёж подтверждён'
	if (payment.status === 'pending') return 'Платёж создан'
	if (payment.status === 'failed') return 'Платёж не прошёл'
	return 'Платёж отменён'
}

const paymentAmountLabel = (payment: BillingPayment) => {
	const creditedAmount = payment.creditedAmount ?? payment.amount
	const bonusAmount = payment.bonusAmount ?? 0
	if (bonusAmount > 0) return `${formatMoney(creditedAmount)} с бонусом ${formatMoney(bonusAmount)}`
	return formatMoney(creditedAmount)
}
</script>
