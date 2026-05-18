<template>
	<section v-if="FEATURES.tariffsPage" class="tariffs-panel">
		<div class="tariffs-panel__hero">
			<span class="tariffs-panel__eyebrow">Тарифы</span>
			<h1>Тарифы</h1>
			<p>Управляйте подписками, AI-лимитами, промокодами и историей оплат через ту же backend-логику, что используется в личном кабинете.</p>
		</div>

		<p v-if="statusMessage" :class="['tariffs-status', statusKind]">
			{{ statusMessage }}
		</p>

		<div v-if="isLoading" class="tariffs-section tariffs-state">
			<h2>Загружаем тарифы...</h2>
			<p>Получаем баланс, подписки, лимиты и историю оплат из backend.</p>
		</div>

		<div v-else-if="loadError && !userStore.billing" class="tariffs-section tariffs-state tariffs-state--error">
			<h2>Не удалось загрузить тарифы</h2>
			<p>{{ loadError }}</p>
			<button type="button" class="pill-btn pill-btn--active" :disabled="isBusy" @click="retryLoad">
				Повторить
			</button>
		</div>

		<template v-else>
			<div class="tariffs-current">
				<div>
					<span class="tariffs-current__label">Текущий режим</span>
					<strong>{{ activeModeLabel }}</strong>
					<p v-if="activeSubscription">Подписка действует до {{ formatDate(activeSubscription.expiresAt) }}.</p>
					<p v-else>Pay-per-request активен автоматически, когда нет действующей подписки.</p>
				</div>

				<div class="tariffs-current__stats">
					<span>Баланс: {{ formatMoney(walletBalance) }} ₽</span>
					<span>Запросы по подписке: {{ userStore.billing?.usageSnapshot.remainingIncludedRequests || 0 }}</span>
					<span>AI статус: {{ aiStatusLabel }}</span>
				</div>
			</div>

			<div class="tariffs-section">
				<div class="tariffs-section__head">
					<div>
						<h2>Подписки</h2>
						<span>Тарифы загружаются из `/api/billing/summary`</span>
					</div>
					<button type="button" class="pill-btn" :disabled="isBusy" @click="showRechargeModal = true">
						Пополнить баланс
					</button>
				</div>

				<div v-if="plans.length" class="tariff-grid">
					<article
						v-for="plan in plans"
						:key="plan.id"
						:class="['tariff-card', { 'tariff-card--popular': plan.accessTier === 'premium', 'tariff-card--current': activeSubscription?.plan?.code === plan.code }]"
					>
						<div class="tariff-card__head">
							<span class="tariff-card__badge">{{ plan.accessTier === 'premium' ? 'Премиум' : 'База' }}</span>
							<span v-if="activeSubscription?.plan?.code === plan.code" class="tariff-card__status">Активен</span>
						</div>

						<h2>{{ plan.name }}</h2>
						<p>{{ planDescription(plan.code) }}</p>
						<strong class="tariff-card__price">{{ formatMoneyMinor(getEffectivePlanPriceMinor(plan)) }} ₽</strong>

						<div class="tariff-limits" aria-label="Лимиты тарифа">
							<span>{{ plan.intervalDays }} дней</span>
							<span>{{ plan.includedRequests }} запросов</span>
							<span>{{ plan.accessTier === 'premium' ? 'Premium модели' : 'Базовые модели' }}</span>
						</div>

						<div class="tariffs-promo tariffs-promo--card">
							<input
								:value="getPlanPromoCode(plan.code)"
								type="text"
								placeholder="Промокод"
								@input="updatePlanPromoCode(plan.code, $event)"
							/>
							<button type="button" :disabled="isBusy || isPlanPreviewPending(plan.code)" @click="previewPlan(plan.code)">
								{{ isPlanPreviewPending(plan.code) ? 'Проверяем...' : 'Применить' }}
							</button>
						</div>

						<div v-if="getPlanPreview(plan.code)" class="tariff-preview">
							<span>Скидка: {{ formatMoneyMinor(getPlanPreview(plan.code)?.discountMinor) }} ₽</span>
							<strong>Итог: {{ formatMoneyMinor(getPlanPreview(plan.code)?.finalPriceMinor) }} ₽</strong>
							<span v-if="getPlanPreview(plan.code)?.appliedDiscount">
								{{ getPlanPreview(plan.code)?.appliedDiscount?.name }}
							</span>
						</div>

						<button
							type="button"
							class="tariff-card__button"
							:disabled="isBusy || !canBuyPlan(plan) || activeSubscription?.plan?.code === plan.code"
							@click="purchaseCorePlan(plan.code)"
						>
							{{ isBusy ? 'Подождите...' : planButtonLabel(plan) }}
						</button>
					</article>

					<article :class="['tariff-card', 'tariff-card--payg', { 'tariff-card--current': !activeSubscription }]">
						<div class="tariff-card__head">
							<span class="tariff-card__badge">Гибко</span>
							<span v-if="!activeSubscription" class="tariff-card__status">Активен</span>
						</div>
						<h2>Pay-per-request</h2>
						<p>Оплата по факту использования из кошелька.</p>
						<strong class="tariff-card__price">{{ userStore.billing?.paygPricing.basic || 5 }} ₽ / запрос</strong>
						<div class="tariff-limits">
							<span>Без абонплаты</span>
							<span>Автоматически без подписки</span>
							<span>Баланс: {{ formatMoney(walletBalance) }} ₽</span>
						</div>
						<button type="button" class="tariff-card__button" disabled>
							{{ activeSubscription ? 'Включится после подписки' : 'Сейчас активен' }}
						</button>
					</article>
				</div>

				<p v-else class="tariffs-empty-text">Тарифы пока не пришли с backend.</p>
			</div>

			<div class="tariffs-section">
				<div class="tariffs-section__head">
					<div>
						<h2>AI-тарифы</h2>
						<span>Данные берутся из `/api/ai/plans` и `/api/ai/access`</span>
					</div>
				</div>

				<div class="ai-usage-grid tariffs-ai-usage">
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

				<div v-if="aiPlans.length" class="tariff-grid">
					<article
						v-for="plan in aiPlans"
						:key="plan.id"
						:class="['tariff-card', { 'tariff-card--popular': plan.accessTier === 'premium', 'tariff-card--current': isAiSubscriptionActive && aiAccess?.plan?.code === plan.code }]"
					>
						<div class="tariff-card__head">
							<span class="tariff-card__badge">AI</span>
							<span v-if="isAiSubscriptionActive && aiAccess?.plan?.code === plan.code" class="tariff-card__status">
								Активен
							</span>
						</div>

						<h2>{{ plan.name }}</h2>
						<p>{{ plan.intervalDays }} дней AI-доступа.</p>
						<strong class="tariff-card__price">{{ formatMoneyMinor(getEffectivePlanPriceMinor(plan)) }} ₽</strong>

						<div class="tariff-limits" aria-label="AI лимиты тарифа">
							<span>Chat: {{ formatAiCounter(plan.aiChatLimit) }}</span>
							<span>Voice: {{ formatAiCounter(plan.aiVoiceLimit) }}</span>
							<span>Files: {{ formatAiCounter(plan.aiFileUploadLimit) }}</span>
						</div>

						<div class="tariffs-promo tariffs-promo--card">
							<input
								:value="getPlanPromoCode(plan.code)"
								type="text"
								placeholder="Промокод"
								@input="updatePlanPromoCode(plan.code, $event)"
							/>
							<button type="button" :disabled="isBusy || isPlanPreviewPending(plan.code)" @click="previewPlan(plan.code)">
								{{ isPlanPreviewPending(plan.code) ? 'Проверяем...' : 'Применить' }}
							</button>
						</div>

						<div v-if="getPlanPreview(plan.code)" class="tariff-preview">
							<span>Скидка: {{ formatMoneyMinor(getPlanPreview(plan.code)?.discountMinor) }} ₽</span>
							<strong>Итог: {{ formatMoneyMinor(getPlanPreview(plan.code)?.finalPriceMinor) }} ₽</strong>
							<span v-if="getPlanPreview(plan.code)?.appliedDiscount">
								{{ getPlanPreview(plan.code)?.appliedDiscount?.name }}
							</span>
						</div>

						<button
							type="button"
							class="tariff-card__button"
							:disabled="isBusy || !canBuyAiPlan(plan)"
							@click="purchaseAiPlan(plan.code)"
						>
							{{ isBusy ? 'Подождите...' : aiPlanButtonLabel(plan) }}
						</button>
					</article>
				</div>

				<p v-else class="tariffs-empty-text">AI-тарифы пока не пришли с backend.</p>
			</div>

			<div class="tariffs-split">
				<div class="tariffs-section">
					<div class="tariffs-section__head">
						<h2>Последние операции</h2>
						<span>{{ recentLedger.length ? 'Кошелёк и подписки' : 'Нет данных' }}</span>
					</div>

					<ul v-if="recentLedger.length" class="tariffs-history">
						<li v-for="entry in recentLedger" :key="entry.id">
							<strong>{{ ledgerTitle(entry.reason) }}</strong>
							<span>{{ ledgerAmount(entry) }} · {{ formatDate(entry.createdAt) }}</span>
						</li>
					</ul>
					<p v-else class="tariffs-empty-text">Операции появятся после пополнения, покупки тарифа или списания.</p>
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
					<p v-else class="tariffs-empty-text">История появится здесь после первого платежа.</p>
				</div>
			</div>
		</template>

		<RechargeModal v-model:visible="showRechargeModal" @success="handleRecharge" />
	</section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'

import { FEATURES } from '../config/features'
import {
	formatAiCounter,
	formatDate,
	formatMoney,
	formatMoneyMinor,
	useBilling,
} from '../composables/useBilling'
import { trackEvent } from '../utils/analytics'
import RechargeModal from '../components/profile/RechargeModal.vue'

const showRechargeModal = ref(false)
const {
	userStore,
	statusMessage,
	statusKind,
	isBusy,
	isLoading,
	loadError,
	activeSubscription,
	plans,
	aiAccess,
	isAiSubscriptionActive,
	aiLimits,
	aiRemaining,
	aiPlans,
	walletBalance,
	recentLedger,
	recentPayments,
	activeModeLabel,
	aiStatusLabel,
	getPlanPromoCode,
	getPlanPreview,
	isPlanPreviewPending,
	updatePlanPromoCode,
	applyPlanPreview,
	getEffectivePlanPriceMinor,
	canBuyPlan,
	canBuyAiPlan,
	planButtonLabel,
	aiPlanButtonLabel,
	planDescription,
	ledgerTitle,
	ledgerAmount,
	paymentTitle,
	paymentAmountLabel,
	loadBilling,
	buyPlan,
	buyAiPlan,
	handleRecharge,
} = useBilling()

const retryLoad = () => {
	void loadBilling()
}

const previewPlan = (planCode: string) => {
	void applyPlanPreview(planCode).catch(() => undefined)
}

const purchaseCorePlan = (planCode: string) => {
	void buyPlan(planCode).catch(() => undefined)
}

const purchaseAiPlan = (planCode: string) => {
	void buyAiPlan(planCode).catch(() => undefined)
}

onMounted(() => {
	trackEvent('tariffs_opened')
	void loadBilling().catch(() => undefined)
})
</script>
