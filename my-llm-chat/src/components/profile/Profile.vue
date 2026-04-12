<template>
	<div class="profile">
		<template v-if="userStore.user">
			<div class="profile-header">
				<div class="profile-header-user">
					<img :src="avatarUrl" alt="avatar" class="profile-avatar" />
					<div class="profile-head-info">
						<h2>{{ userStore.user.firstName }} {{ userStore.user.lastName }}</h2>
						<p class="profile-id">Личный кабинет</p>
					</div>
					<button @click="userStore.logout" class="logout-btn profile-header-logout">Выйти из аккаунта</button>
				</div>

				<p v-if="statusMessage" :class="['profile-status', statusKind]">
					{{ statusMessage }}
				</p>

				<div class="profile-stats">
					<div class="stat-card">
						<span class="stat-label">Баланс</span>
						<strong>{{ formatMoney(userStore.user.balance) }} ₽</strong>
					</div>

					<div class="stat-card">
						<span class="stat-label">Остаток по подписке</span>
						<strong>{{ userStore.billing?.usageSnapshot.remainingIncludedRequests || 0 }}</strong>
					</div>
				</div>
			</div>

			<div class="billing-card">
				<div class="section-head">
					<h3>Тарифы и оплата</h3>
					<p class="billing-subtitle">
						Источник правды теперь backend: баланс, подписки, списания и история операций хранятся в базе и
						используются во всех сценариях оплаты.
					</p>
				</div>

				<div class="billing-summary">
					<p>
						Текущий режим:
						<b>{{ activeModeLabel }}</b>
					</p>

					<p v-if="activeSubscription">
						Подписка действует до:
						<b>{{ formatDate(activeSubscription.expiresAt) }}</b>
					</p>

					<p v-if="activeSubscription">
						Осталось включённых запросов:
						<b>{{ activeSubscription.remainingRequests }}</b>
					</p>

					<p v-else class="hint-text">
						Pay-per-request активен автоматически, когда нет действующей подписки.
					</p>

					<p class="hint-text">
						Базовые модели: {{ userStore.billing?.paygPricing.basic || 2 }} ₽ за запрос. Премиальные:
						{{ userStore.billing?.paygPricing.premium || 14 }} ₽ за запрос.
					</p>
				</div>

				<div class="plans-grid">
					<div
						v-for="plan in plans"
						:key="plan.id"
						:class="[
							'plan-item',
							plan.accessTier === 'premium' ? 'pro-plan featured-plan' : 'cheap-plan',
							{ active: activeSubscription?.plan?.code === plan.code },
						]"
					>
						<div class="plan-badge">
							{{ plan.accessTier === 'premium' ? 'Премиум' : 'База' }}
						</div>
						<h4>{{ plan.name }}</h4>
						<p class="plan-period">{{ plan.intervalDays }} дней</p>
						<p class="plan-price">{{ formatMoney(plan.price) }} ₽</p>

						<ul>
							<li>{{ plan.includedRequests }} включённых запросов на период</li>
							<li>{{ plan.accessTier === 'premium' ? 'Доступ ко всем моделям' : 'Доступ к базовым моделям' }}</li>
							<li>{{ planDescription(plan.code) }}</li>
						</ul>

						<button
							@click="buyPlan(plan.code)"
							:disabled="isBusy || !canBuyPlan(plan) || activeSubscription?.plan?.code === plan.code"
						>
							{{ planButtonLabel(plan) }}
						</button>
					</div>

					<div :class="['plan-item', 'payg-plan', { active: !activeSubscription }]">
						<div class="plan-badge">Гибко</div>
						<h4>Pay-per-request</h4>
						<p class="plan-period">Без абонплаты</p>
						<p class="plan-price">По факту использования</p>

						<ul>
							<li>Баланс списывается из кошелька в базе</li>
							<li>Сценарий включается автоматически, когда нет активной подписки</li>
							<li>Подходит как резервный продакшен-режим даже без подключённого эквайринга</li>
						</ul>

						<button disabled>
							{{ activeSubscription ? 'Включится после подписки' : 'Сейчас активен' }}
						</button>
					</div>
				</div>
			</div>

			<div class="models-section">
				<div class="models-column cheap-column">
					<h4>Последние операции</h4>
					<ul>
						<li v-if="!recentLedger.length">
							<b>Пока пусто</b>
							<span>После пополнения, покупки тарифа или списания за запросы операции появятся здесь.</span>
						</li>
						<li v-for="entry in recentLedger" :key="entry.id">
							<b>{{ ledgerTitle(entry.reason) }}</b>
							<span>{{ ledgerAmount(entry) }} · {{ formatDate(entry.createdAt) }}</span>
						</li>
					</ul>
				</div>

				<div class="models-column pro-column">
					<h4>Платежи</h4>
					<ul>
						<li v-if="!recentPayments.length">
							<b>Пока нет платежей</b>
							<span>После первого пополнения здесь появится история созданных и подтверждённых платежей.</span>
						</li>
						<li v-for="payment in recentPayments" :key="payment.id">
							<b>{{ payment.status === 'succeeded' ? 'Пополнение подтверждено' : 'Платёж создан' }}</b>
							<span>{{ formatMoney(payment.amount) }} ₽ · {{ formatDate(payment.createdAt) }}</span>
						</li>
					</ul>
				</div>
			</div>

			<div class="profile-actions">
				<button @click="showRechargeModal = true" class="recharge-btn" :disabled="isBusy">Пополнить</button>
				<button @click="reloadBilling" class="logout-btn" :disabled="isBusy">Обновить</button>
			</div>
		</template>

		<div v-else class="loading">
			<p>Загрузка данных пользователя...</p>
		</div>

		<RechargeModal v-model:visible="showRechargeModal" @success="handleRecharge" />
	</div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import type { BillingLedgerEntry, BillingPayment, BillingPlan } from '../../types'
import { useUserStore } from '../../stores/user'
import RechargeModal from './RechargeModal.vue'

const userStore = useUserStore()
const showRechargeModal = ref(false)
const statusMessage = ref('')
const statusKind = ref<'success' | 'error'>('success')
const isBusy = ref(false)
const fallbackAvatar =
	'data:image/svg+xml;charset=UTF-8,' +
	encodeURIComponent(
		'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" rx="100" fill="#1f2937"/><text x="100" y="112" text-anchor="middle" font-size="64" font-family="Arial" fill="#ffffff">U</text></svg>',
	)

const avatarUrl = computed(() => userStore.user?.photo_200 || fallbackAvatar)
const activeSubscription = computed(() => userStore.activeSubscription)
const plans = computed(() => userStore.billing?.plans || [])
const recentLedger = computed(() => (userStore.billing?.recentLedger || []).slice(0, 6))
const recentPayments = computed(() => (userStore.billing?.recentPayments || []).slice(0, 6))

const activeModeLabel = computed(() => {
	if (!activeSubscription.value?.plan) return 'Pay-per-request'
	return `${activeSubscription.value.plan.name} до ${formatDate(activeSubscription.value.expiresAt)}`
})

const clearStatusLater = () => {
	window.setTimeout(() => {
		statusMessage.value = ''
	}, 5000)
}

const setSuccess = (message: string) => {
	statusKind.value = 'success'
	statusMessage.value = message
	clearStatusLater()
}

const setError = (message: string) => {
	statusKind.value = 'error'
	statusMessage.value = message
	clearStatusLater()
}

const formatMoney = (value: number) => Number(value || 0).toFixed(0)
const formatDate = (value: string) => new Date(value).toLocaleString()

const planDescription = (planCode: string) => {
	if (planCode === 'monthly-premium') return 'Подходит для тяжёлых и специализированных сценариев'
	return 'Подходит для массовых базовых сценариев'
}

const canBuyPlan = (plan: BillingPlan) => (userStore.user?.balance || 0) >= plan.price

const planButtonLabel = (plan: BillingPlan) => {
	if (activeSubscription.value?.plan?.code === plan.code) return 'Уже активна'
	return canBuyPlan(plan) ? 'Купить подписку' : 'Недостаточно средств'
}

const ledgerTitle = (reason: BillingLedgerEntry['reason']) => {
	switch (reason) {
		case 'payment_topup':
			return 'Пополнение баланса'
		case 'subscription_purchase':
			return 'Покупка подписки'
		case 'usage_charge':
			return 'Списание за запрос'
		default:
			return 'Операция'
	}
}

const ledgerAmount = (entry: BillingLedgerEntry) => `${entry.type === 'debit' ? '-' : '+'}${formatMoney(entry.amount)} ₽`

const reloadBilling = async () => {
	if (isBusy.value) return
	try {
		isBusy.value = true
		await userStore.syncProfileFromServer()
		setSuccess('Данные по биллингу обновлены.')
	} catch (error) {
		setError((error as Error).message || 'Не удалось обновить биллинг.')
	} finally {
		isBusy.value = false
	}
}

const buyPlan = async (planCode: string) => {
	if (isBusy.value) return

	try {
		isBusy.value = true
		await userStore.purchasePlan(planCode)
		setSuccess('Подписка активирована и сохранена в базе.')
	} catch (error) {
		setError((error as Error).message || 'Не удалось купить подписку.')
	} finally {
		isBusy.value = false
	}
}

const handleRecharge = (amount: number) => {
	setSuccess(`Платёж подтверждён. Баланс пополнен на ${formatMoney(amount)} ₽.`)
}

onMounted(() => {
	void userStore.syncProfileFromServer().catch(error => {
		setError((error as Error).message || 'Не удалось загрузить биллинг.')
	})
})
</script>
