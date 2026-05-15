<template>
	<div class="profile">
		<template v-if="userStore.user">
			<div class="profile-shell">
				<header class="profile-hero">
					<div class="profile-user">
						<img :src="avatarUrl" alt="avatar" class="profile-avatar" />

						<div class="profile-head-info">
							<h2>{{ userStore.user.firstName }} {{ userStore.user.lastName }}</h2>
							<p class="profile-id">Личный кабинет</p>
						</div>
					</div>

					<div class="profile-balance-card">
						<span class="profile-balance-label">Баланс</span>
						<strong>{{ formatMoney(userStore.user.balance) }} ₽</strong>
						<div class="profile-balance-actions">
							<button @click="showRechargeModal = true" class="recharge-btn" :disabled="isBusy">Пополнить</button>
							<button @click="reloadBilling" class="logout-btn" :disabled="isBusy">Обновить</button>
						</div>
					</div>

					<button @click="userStore.logout" class="logout-btn profile-header-logout">Выйти</button>
				</header>

				<p v-if="statusMessage" :class="['profile-status', statusKind]">
					{{ statusMessage }}
				</p>

				<nav class="profile-tabs" aria-label="Разделы профиля">
					<button
						type="button"
						:class="['profile-tab', { active: activeTab === 'overview' }]"
						@click="activeTab = 'overview'"
					>
						Обзор
					</button>

					<button
						type="button"
						:class="['profile-tab', { active: activeTab === 'plans' }]"
						@click="activeTab = 'plans'"
					>
						Тарифы
					</button>

					<button
						type="button"
						:class="['profile-tab', { active: activeTab === 'ai' }]"
						@click="activeTab = 'ai'"
					>
						AI
					</button>

					<button
						type="button"
						:class="['profile-tab', { active: activeTab === 'history' }]"
						@click="activeTab = 'history'"
					>
						История
					</button>
				</nav>

				<section v-show="activeTab === 'overview'" class="profile-tab-panel">
					<div class="profile-stats profile-stats--overview">
						<div class="stat-card stat-card--accent">
							<span class="stat-label">Баланс</span>
							<strong>{{ formatMoney(userStore.user.balance) }} ₽</strong>
						</div>

						<div class="stat-card">
							<span class="stat-label">Остаток по подписке</span>
							<strong>{{ userStore.billing?.usageSnapshot.remainingIncludedRequests || 0 }}</strong>
						</div>

						<div class="stat-card">
							<span class="stat-label">Текущий режим</span>
							<strong>{{ activeSubscription ? activeSubscription.plan?.name : 'Pay-per-request' }}</strong>
						</div>

						<div class="stat-card">
							<span class="stat-label">AI статус</span>
							<strong>{{ isAiSubscriptionActive ? 'Активен' : 'Не активен' }}</strong>
						</div>
					</div>

					<div class="billing-card">
						<div class="section-head">
							<h3>Сводка</h3>
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

							<p v-else class="hint-text">Pay-per-request активен автоматически, когда нет действующей подписки.</p>

							<p class="hint-text">
								Любой запрос в режиме pay-per-request: {{ userStore.billing?.paygPricing.basic || 5 }} ₽.
							</p>

							<p v-if="automaticDiscounts.length" class="hint-text">
								Автоматические акции:
								<b>{{ automaticDiscounts.map(discount => discount.name).join(', ') }}</b>
							</p>
						</div>
					</div>
				</section>

				<section v-show="activeTab === 'plans'" class="profile-tab-panel">
					<div class="billing-card">
						<div class="section-head section-head--row">
							<div>
								<h3>Тарифы и оплата</h3>
								<p class="billing-subtitle">Выберите подписку или используйте оплату по факту запросов.</p>
							</div>
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
								<div class="plan-head">
									<div class="plan-badge">
										{{ plan.accessTier === 'premium' ? 'Премиум' : 'База' }}
									</div>
									<span v-if="activeSubscription?.plan?.code === plan.code" class="plan-active-label">Активен</span>
								</div>

								<h4>{{ plan.name }}</h4>
								<p class="plan-period">{{ plan.intervalDays }} дней</p>
								<p class="plan-price">{{ formatMoney(plan.price) }} ₽</p>

								<div class="plan-discount-controls">
									<input
										:value="getPlanPromoCode(plan.code)"
										type="text"
										placeholder="Промокод"
										class="plan-promo-input"
										@input="updatePlanPromoCode(plan.code, $event)"
									/>
									<button
										type="button"
										class="plan-preview-btn"
										:disabled="isBusy || isPlanPreviewPending(plan.code)"
										@click="applyPlanPreview(plan.code)"
									>
										{{
											isPlanPreviewPending(plan.code)
												? 'Проверяем...'
												: getPlanPromoCode(plan.code).trim()
													? 'Применить'
													: 'Проверить цену'
										}}
									</button>
								</div>

								<div v-if="getPlanPreview(plan.code)" class="plan-preview">
									<p>
										Базовая цена:
										<b>{{ formatMoneyMinor(getPlanPreview(plan.code)?.basePriceMinor) }} ₽</b>
									</p>
									<p>
										Скидка:
										<b>{{ formatMoneyMinor(getPlanPreview(plan.code)?.discountMinor) }} ₽</b>
									</p>
									<p>
										Итог:
										<b>{{ formatMoneyMinor(getPlanPreview(plan.code)?.finalPriceMinor) }} ₽</b>
									</p>
									<p v-if="getPlanPreview(plan.code)?.appliedDiscount" class="plan-preview__discount">
										Применено: {{ getPlanPreview(plan.code)?.appliedDiscount?.name }}
									</p>
									<p v-if="getPlanPreview(plan.code)?.message" class="plan-preview__message">
										{{ getPlanPreview(plan.code)?.message }}
									</p>
								</div>

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
								<div class="plan-head">
									<div class="plan-badge">Гибко</div>
									<span v-if="!activeSubscription" class="plan-active-label">Активен</span>
								</div>

								<h4>Pay-per-request</h4>
								<p class="plan-period">Без абонплаты</p>
								<p class="plan-price">По факту использования</p>

								<ul>
									<li>Баланс списывается из кошелька в базе</li>
									<li>Сценарий включается автоматически, когда нет активной подписки</li>
									<li>Каждый запрос стоит {{ userStore.billing?.paygPricing.basic || 5 }} ₽</li>
								</ul>

								<button disabled>
									{{ activeSubscription ? 'Включится после подписки' : 'Сейчас активен' }}
								</button>
							</div>
						</div>
					</div>
				</section>

				<section v-show="activeTab === 'ai'" class="profile-tab-panel">
					<div class="billing-card">
						<div class="section-head">
							<h3>AI подписка</h3>
							<p class="billing-subtitle">Отдельный тариф для AI-чата, голосовых сообщений и файлового контекста.</p>
						</div>

						<div class="billing-summary">
							<p>
								Статус AI:
								<b>{{ aiStatusLabel }}</b>
							</p>

							<p v-if="isAiSubscriptionActive && aiAccess?.plan">
								Активный AI-тариф:
								<b>{{ aiAccess.plan.name }}</b>
							</p>

							<p v-if="isAiSubscriptionActive && aiAccess?.subscription">
								Действует до:
								<b>{{ formatDate(aiAccess.subscription.expiresAt) }}</b>
							</p>

							<p v-else-if="aiAccess?.subscription?.status === 'expired'" class="hint-text">
								AI-подписка истекла. Ниже можно купить новый AI-тариф.
							</p>

							<p v-else class="hint-text">AI-подписка не активна. Для AI-чата нужна отдельная подписка.</p>
						</div>

						<div class="ai-usage-grid">
							<div class="ai-usage-card">
								<span class="stat-label">Чат</span>
								<strong>{{ formatAiCounter(aiRemaining.chat) }}</strong>
								<small>из {{ formatAiCounter(aiLimits.chat) }}</small>
							</div>

							<div class="ai-usage-card">
								<span class="stat-label">Voice</span>
								<strong>{{ formatAiCounter(aiRemaining.voice) }}</strong>
								<small>из {{ formatAiCounter(aiLimits.voice) }}</small>
							</div>

							<div class="ai-usage-card">
								<span class="stat-label">Файлы</span>
								<strong>{{ formatAiCounter(aiRemaining.fileUpload) }}</strong>
								<small>из {{ formatAiCounter(aiLimits.fileUpload) }}</small>
							</div>
						</div>

						<div class="profile-stats profile-stats--ai">
							<div class="stat-card">
								<span class="stat-label">Лимиты</span>
								<strong>
									чат {{ formatAiCounter(aiLimits.chat) }} / voice {{ formatAiCounter(aiLimits.voice) }} /
									files {{ formatAiCounter(aiLimits.fileUpload) }}
								</strong>
							</div>

							<div class="stat-card">
								<span class="stat-label">Использовано</span>
								<strong>
									чат {{ formatAiCounter(aiUsage.chat) }} / voice {{ formatAiCounter(aiUsage.voice) }} /
									files {{ formatAiCounter(aiUsage.fileUpload) }}
								</strong>
							</div>

							<div class="stat-card">
								<span class="stat-label">Осталось</span>
								<strong>
									чат {{ formatAiCounter(aiRemaining.chat) }} / voice
									{{ formatAiCounter(aiRemaining.voice) }} / files
									{{ formatAiCounter(aiRemaining.fileUpload) }}
								</strong>
							</div>
						</div>

						<div class="plans-grid">
							<div
								v-for="plan in aiPlans"
								:key="plan.id"
								:class="['plan-item', 'cheap-plan', { active: isAiSubscriptionActive && aiAccess?.plan?.code === plan.code }]"
							>
								<div class="plan-head">
									<div class="plan-badge">AI</div>
									<span v-if="isAiSubscriptionActive && aiAccess?.plan?.code === plan.code" class="plan-active-label">
										Активен
									</span>
								</div>

								<h4>{{ plan.name }}</h4>
								<p class="plan-period">{{ plan.intervalDays }} дней</p>
								<p class="plan-price">{{ formatMoney((plan.priceMinor || 0) / 100) }} ₽</p>

								<div class="plan-discount-controls">
									<input
										:value="getPlanPromoCode(plan.code)"
										type="text"
										placeholder="Промокод"
										class="plan-promo-input"
										@input="updatePlanPromoCode(plan.code, $event)"
									/>
									<button
										type="button"
										class="plan-preview-btn"
										:disabled="isBusy || isPlanPreviewPending(plan.code)"
										@click="applyPlanPreview(plan.code)"
									>
										{{
											isPlanPreviewPending(plan.code)
												? 'Проверяем...'
												: getPlanPromoCode(plan.code).trim()
													? 'Применить'
													: 'Проверить цену'
										}}
									</button>
								</div>

								<div v-if="getPlanPreview(plan.code)" class="plan-preview">
									<p>
										Базовая цена:
										<b>{{ formatMoneyMinor(getPlanPreview(plan.code)?.basePriceMinor) }} ₽</b>
									</p>
									<p>
										Скидка:
										<b>{{ formatMoneyMinor(getPlanPreview(plan.code)?.discountMinor) }} ₽</b>
									</p>
									<p>
										Итог:
										<b>{{ formatMoneyMinor(getPlanPreview(plan.code)?.finalPriceMinor) }} ₽</b>
									</p>
									<p v-if="getPlanPreview(plan.code)?.appliedDiscount" class="plan-preview__discount">
										Применено: {{ getPlanPreview(plan.code)?.appliedDiscount?.name }}
									</p>
									<p v-if="getPlanPreview(plan.code)?.message" class="plan-preview__message">
										{{ getPlanPreview(plan.code)?.message }}
									</p>
								</div>

								<ul>
									<li>Чат: {{ formatAiCounter(plan.aiChatLimit) }}</li>
									<li>Voice: {{ formatAiCounter(plan.aiVoiceLimit) }}</li>
									<li>Файлы: {{ formatAiCounter(plan.aiFileUploadLimit) }}</li>
								</ul>

								<button @click="buyAiPlan(plan.code)" :disabled="isBusy || !canBuyAiPlan(plan)">
									{{ aiPlanButtonLabel(plan) }}
								</button>
							</div>

							<div v-if="!aiPlans.length" :class="['plan-item', 'payg-plan']">
								<div class="plan-badge">AI</div>
								<h4>AI-тарифы загружаются</h4>
								<p class="plan-period">Список появится после загрузки профиля</p>
								<p class="plan-price">—</p>
							</div>
						</div>
					</div>
				</section>

				<section v-show="activeTab === 'history'" class="profile-tab-panel">
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
									<b>{{ paymentTitle(payment) }}</b>
									<span>{{ paymentAmountLabel(payment) }} · {{ formatDate(payment.createdAt) }}</span>
								</li>
							</ul>
						</div>
					</div>
				</section>
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

import type {
	AiAccessPlan,
	BillingLedgerEntry,
	BillingPayment,
	BillingPlan,
	SubscriptionPurchasePreview,
} from '../../types'
import { canBuyPlanFromWallet } from '../../domain/billingRules'
import { emptyAiCounters, normalizeAiCounters } from '../../domain/aiSubscription'
import { useUserStore } from '../../stores/user'
import RechargeModal from './RechargeModal.vue'

const userStore = useUserStore()
const showRechargeModal = ref(false)
const statusMessage = ref('')
const statusKind = ref<'success' | 'error'>('success')
const isBusy = ref(false)
const activeTab = ref<'overview' | 'plans' | 'ai' | 'history'>('overview')
const planPromoCodes = ref<Record<string, string>>({})
const planPreviews = ref<Record<string, SubscriptionPurchasePreview | null>>({})
const planPreviewLoading = ref<Record<string, boolean>>({})

const fallbackAvatar =
	'data:image/svg+xml;charset=UTF-8,' +
	encodeURIComponent(
		'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" rx="100" fill="#1f2937"/><text x="100" y="112" text-anchor="middle" font-size="64" font-family="Arial" fill="#ffffff">U</text></svg>',
	)

const avatarUrl = computed(() => userStore.user?.photo_200 || fallbackAvatar)
const activeSubscription = computed(() => userStore.activeSubscription)
const plans = computed(() => userStore.billing?.plans || [])
const aiAccess = computed(() => userStore.aiAccess)
const isAiSubscriptionActive = computed(() => userStore.isAiSubscriptionActive)
const aiLimits = computed(() =>
	isAiSubscriptionActive.value ? normalizeAiCounters(aiAccess.value?.limits) : emptyAiCounters(),
)
const aiUsage = computed(() =>
	isAiSubscriptionActive.value ? normalizeAiCounters(aiAccess.value?.usage) : emptyAiCounters(),
)
const aiRemaining = computed(() =>
	isAiSubscriptionActive.value ? normalizeAiCounters(aiAccess.value?.remaining) : emptyAiCounters(),
)
const aiPlans = computed(() => userStore.aiPlans || [])
const availableBalanceMinor = computed(() => Number(userStore.billing?.wallet.balanceMinor || 0))
const recentLedger = computed(() => (userStore.billing?.recentLedger || []).slice(0, 6))
const recentPayments = computed(() => (userStore.billing?.recentPayments || []).slice(0, 6))
const automaticDiscounts = computed(() => userStore.billing?.automaticDiscounts || [])

const activeModeLabel = computed(() => {
	if (!activeSubscription.value?.plan) return 'Pay-per-request'
	return `${activeSubscription.value.plan.name} до ${formatDate(activeSubscription.value.expiresAt)}`
})

const aiStatusLabel = computed(() => {
	if (isAiSubscriptionActive.value && aiAccess.value?.plan && aiAccess.value.subscription) {
		return `${aiAccess.value.plan.name} до ${formatDate(aiAccess.value.subscription.expiresAt)}`
	}

	if (aiAccess.value?.subscription?.status === 'expired') {
		return 'AI-подписка истекла'
	}

	return 'AI-подписка не активна'
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
const formatMoneyMinor = (value?: number | null) => formatMoney(Number(value || 0) / 100)
const formatDate = (value: string) => new Date(value).toLocaleString()

const normalizePromoCode = (value?: string) => {
	const normalized = String(value || '').trim()
	return normalized || undefined
}

const formatAiCounter = (value?: number | null) => Number(value ?? 0)

const planDescription = (planCode: string) => {
	if (planCode === 'monthly-premium') return 'Подходит для тяжёлых и специализированных сценариев'
	return 'Подходит для массовых базовых сценариев'
}

const getPlanPromoCode = (planCode: string) => planPromoCodes.value[planCode] || ''
const getPlanPreview = (planCode: string) => planPreviews.value[planCode] || null
const isPlanPreviewPending = (planCode: string) => Boolean(planPreviewLoading.value[planCode])

const updatePlanPromoCode = (planCode: string, event: Event) => {
	const value = (event.target as HTMLInputElement | null)?.value || ''

	planPromoCodes.value = {
		...planPromoCodes.value,
		[planCode]: value,
	}

	planPreviews.value = {
		...planPreviews.value,
		[planCode]: null,
	}
}

const applyPlanPreview = async (planCode: string) => {
	try {
		planPreviewLoading.value = {
			...planPreviewLoading.value,
			[planCode]: true,
		}

		const preview = await userStore.previewSubscriptionPurchase(planCode, normalizePromoCode(getPlanPromoCode(planCode)))

		planPreviews.value = {
			...planPreviews.value,
			[planCode]: preview,
		}
	} catch (error) {
		setError((error as Error).message || 'Не удалось получить preview тарифа.')
	} finally {
		planPreviewLoading.value = {
			...planPreviewLoading.value,
			[planCode]: false,
		}
	}
}

const getEffectivePlanPriceMinor = (plan: BillingPlan | AiAccessPlan) =>
	getPlanPreview(plan.code)?.finalPriceMinor ?? Number(plan.priceMinor || 0)

const canBuyPlan = (plan: BillingPlan) =>
	canBuyPlanFromWallet({
		walletBalanceMinor: availableBalanceMinor.value,
		planPriceMinor: getEffectivePlanPriceMinor(plan),
	})

const canBuyAiPlan = (plan: AiAccessPlan) => {
	if (isAiSubscriptionActive.value && aiAccess.value?.plan?.code === plan.code) return false
	if (!plan.isActive) return false

	return canBuyPlanFromWallet({
		walletBalanceMinor: availableBalanceMinor.value,
		planPriceMinor: getEffectivePlanPriceMinor(plan),
	})
}

const planButtonLabel = (plan: BillingPlan) => {
	if (activeSubscription.value?.plan?.code === plan.code) return 'Уже активна'
	return canBuyPlan(plan) ? 'Купить подписку' : 'Недостаточно средств'
}

const aiPlanButtonLabel = (plan: AiAccessPlan) => {
	if (isAiSubscriptionActive.value && aiAccess.value?.plan?.code === plan.code) return 'Уже активна'
	if (!plan.isActive) return 'Скоро'
	return canBuyAiPlan(plan) ? 'Купить AI-подписку' : 'Недостаточно средств'
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

const ledgerAmount = (entry: BillingLedgerEntry) =>
	`${entry.type === 'debit' ? '-' : '+'}${formatMoney(entry.amount)} ₽`

const paymentTitle = (payment: BillingPayment) => {
	if (payment.appliedDiscount?.type?.startsWith('topup_bonus')) {
		return 'Пополнение с бонусом'
	}

	return payment.status === 'succeeded' ? 'Пополнение подтверждено' : 'Платёж создан'
}

const paymentAmountLabel = (payment: BillingPayment) => {
	const creditedAmount = payment.creditedAmount ?? payment.amount
	const bonusAmount = payment.bonusAmount ?? 0

	if (bonusAmount > 0) {
		return `${formatMoney(creditedAmount)} ₽ (включая бонус ${formatMoney(bonusAmount)} ₽)`
	}

	return `${formatMoney(creditedAmount)} ₽`
}

const reloadBilling = async () => {
	if (isBusy.value) return

	try {
		isBusy.value = true
		await Promise.all([userStore.syncProfileFromServer(), userStore.loadAiAccess()])
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
		const result = await userStore.purchasePlan(planCode, normalizePromoCode(getPlanPromoCode(planCode)))

		setSuccess(
			result.appliedDiscount
				? `Подписка активирована. Применена скидка: ${result.appliedDiscount.name}.`
				: 'Подписка активирована и сохранена в базе.',
		)
	} catch (error) {
		setError((error as Error).message || 'Не удалось купить подписку.')
	} finally {
		isBusy.value = false
	}
}

const buyAiPlan = async (planCode: string) => {
	if (isBusy.value) return

	try {
		isBusy.value = true
		const result = await userStore.purchasePlan(planCode, normalizePromoCode(getPlanPromoCode(planCode)))

		await userStore.loadAiAccess()
		await userStore.loadAiPlans()

		setSuccess(
			result.appliedDiscount
				? `AI-подписка активирована. Применена скидка: ${result.appliedDiscount.name}.`
				: 'AI-подписка активирована.',
		)
	} catch (error) {
		setError((error as Error).message || 'Не удалось купить AI-подписку.')
	} finally {
		isBusy.value = false
	}
}

const handleRecharge = (payload: { creditedAmount: number; bonusMinor: number; discountName?: string | null }) => {
	const bonusAmount = Number(payload.bonusMinor || 0) / 100

	if (bonusAmount > 0) {
		setSuccess(
			`Платёж подтверждён. На баланс зачислено ${formatMoney(payload.creditedAmount)} ₽, включая бонус ${formatMoney(bonusAmount)} ₽${
				payload.discountName ? ` по акции ${payload.discountName}` : ''
			}.`,
		)
		return
	}

	setSuccess(`Платёж подтверждён. Баланс пополнен на ${formatMoney(payload.creditedAmount)} ₽.`)
}

onMounted(() => {
	void userStore.syncProfileFromServer().catch(error => {
		setError((error as Error).message || 'Не удалось загрузить биллинг.')
	})
})

onMounted(() => {
	void Promise.allSettled([userStore.loadAiAccess(), userStore.loadAiPlans()])
})
</script>
