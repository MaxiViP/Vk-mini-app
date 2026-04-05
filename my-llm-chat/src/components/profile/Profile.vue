<template>
	<div class="profile">
		<template v-if="userStore.user">
			<div class="profile-header">
				<img :src="avatarUrl" alt="avatar" class="profile-avatar" />

				<div class="profile-head-info">
					<h2>{{ userStore.user.firstName }} {{ userStore.user.lastName }}</h2>
					<p class="profile-id">Личный кабинет</p>
				</div>
				<p
					v-if="statusMessage"
					:class="[
						'profile-status',
						{ error: statusMessage.startsWith('⚠️'), success: !statusMessage.startsWith('⚠️') },
					]"
				>
					{{ statusMessage }}
				</p>
			</div>

			<div class="profile-stats">
				<div class="stat-card">
					<span class="stat-label">Баланс</span>
					<strong>{{ userStore.user.balance.toFixed(0) }} ₽</strong>
				</div>

				<div class="stat-card">
					<span class="stat-label">Осталось запросов</span>
					<strong>{{ userStore.user.requestsLeft }}</strong>
				</div>
			</div>

			<div class="billing-card">
				<div class="section-head">
					<h3>💼 Тарифы и доступ к моделям</h3>
					<p class="billing-subtitle">
						Выбери стратегию: платить за каждый запрос или купить подписку под конкретный класс моделей.
					</p>
				</div>

				<div class="billing-summary">
					<p>
						Текущий режим: <b>{{ activeModeLabel }}</b>
					</p>

					<p v-if="activeSubscription && !isSubscriptionExpired">
						Подписка действует до: <b>{{ formatDate(activeSubscription.expiresAt) }}</b>
					</p>

					<p v-else-if="activeSubscription && isSubscriptionExpired" class="warn-text">
						Срок подписки истёк — автоматически включён режим pay-per-request.
					</p>

					<p class="hint-text">Pay-per-request: дешёвые модели — 2 ₽/запрос, спец/обученные — 14 ₽/запрос.</p>
				</div>

				<div class="plans-grid">
					<div
						:class="[
							'plan-item',
							'cheap-plan',
							{ active: activeSubscription?.mode === 'weekly-cheap' && !isSubscriptionExpired },
						]"
					>
						<div class="plan-badge">База</div>
						<h4>🟢 Дешёвая подписка</h4>
						<p class="plan-period">7 дней</p>
						<p class="plan-price">349 ₽</p>

						<ul>
							<li>Доступ ко всем базовым моделям</li>
							<li>До 700 запросов/неделю без доплат</li>
							<li>Оптимально для регулярных задач и тестов</li>
						</ul>

						<button @click="buyPlan('weekly-cheap')" :disabled="!canBuyWeekly">
							{{ canBuyWeekly ? 'Купить подписку' : 'Недостаточно средств' }}
						</button>
					</div>

					<div
						:class="[
							'plan-item',
							'pro-plan',
							'featured-plan',
							{ active: activeSubscription?.mode === 'monthly-pro' && !isSubscriptionExpired },
						]"
					>
						<div class="plan-badge">Премиум</div>
						<h4>🟣 Спец-модели</h4>
						<p class="plan-period">30 дней</p>
						<p class="plan-price">1 990 ₽</p>

						<ul>
							<li>Доступ к обученным/нишевым моделям</li>
							<li>Включены и дешёвые, и дорогие модели</li>
							<li>До 2 500 запросов/месяц без доплат</li>
						</ul>

						<button @click="buyPlan('monthly-pro')" :disabled="!canBuyMonthly">
							{{ canBuyMonthly ? 'Купить подписку' : 'Недостаточно средств' }}
						</button>
					</div>

					<div :class="['plan-item', 'payg-plan', { active: activeMode === 'payg' && !activeSubscription }]">
						<div class="plan-badge">Гибко</div>
						<h4>⚪ Pay-per-request</h4>
						<p class="plan-period">Без абонплаты</p>
						<p class="plan-price">По факту использования</p>

						<ul>
							<li>Платишь только за реальные запросы</li>
							<li>Подходит при нерегулярном использовании</li>
							<li>Дорогие модели доступны по повышенной ставке</li>
						</ul>

						<button @click="activatePayg">Включить режим</button>
					</div>
				</div>
			</div>

			<div class="models-section">
				<div class="models-column cheap-column">
					<h4>🧩 Базовые модели</h4>
					<ul>
						<li v-for="model in cheapModels" :key="model.id">
							<b>{{ model.name }}</b>
							<span>{{ model.description }}</span>
						</li>
					</ul>
				</div>

				<div class="models-column pro-column">
					<h4>🎯 Обученные / дорогие модели</h4>
					<ul>
						<li v-for="model in proModels" :key="model.id">
							<b>{{ model.name }}</b>
							<span>{{ model.description }}</span>
						</li>
					</ul>
				</div>
			</div>

			<div class="profile-actions">
				<button @click="showRechargeModal = true" class="recharge-btn">Пополнить</button>
				<button @click="userStore.logout" class="logout-btn">Выйти</button>
			</div>
		</template>

		<div v-else class="loading">
			<p>Загрузка данных пользователя...</p>
		</div>

		<RechargeModal v-model:visible="showRechargeModal" @success="handleRecharge" />
	</div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useUserStore } from '../../stores/user'
import RechargeModal from './RechargeModal.vue'

type BillingMode = 'payg' | 'weekly-cheap' | 'monthly-pro'

interface SubscriptionState {
	mode: Exclude<BillingMode, 'payg'>
	expiresAt: number
}

interface ModelInfo {
	id: string
	name: string
	description: string
}

const WEEKLY_CHEAP_PRICE = 349
const MONTHLY_PRO_PRICE = 1990

const cheapModels: ModelInfo[] = [
	{ id: 'gpt-4o-mini', name: 'GPT-4o mini', description: 'Быстрая универсальная модель для рутины и FAQ.' },
	{ id: 'llama-3.1-8b', name: 'Llama 3.1 8B', description: 'Экономичная модель для коротких диалогов.' },
	{ id: 'qwen-2.5-7b', name: 'Qwen 2.5 7B', description: 'Хороший баланс качества и цены.' },
	{ id: 'mistral-small', name: 'Mistral Small', description: 'Подходит для массовых обращений пользователей.' },
]

const proModels: ModelInfo[] = [
	{
		id: 'my-marketing-v1',
		name: 'Маркетинг (обученная)',
		description: 'Генерация стратегий, офферов и рекламных гипотез.',
	},
	{ id: 'my-legal-v2', name: 'Юрист РФ (обученная)', description: 'Подготовка юридически-структурированных ответов.' },
	{ id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', description: 'Сложные reasoning-задачи и длинный контекст.' },
	{ id: 'gpt-4.1', name: 'GPT-4.1', description: 'Премиум-качество для важного пользовательского контента.' },
]

const userStore = useUserStore()
const showRechargeModal = ref(false)
const statusMessage = ref('')
const activeMode = ref<BillingMode>('payg')
const activeSubscription = ref<SubscriptionState | null>(null)

const avatarUrl = computed(() => userStore.user?.photo_200 || 'https://via.placeholder.com/200?text=Avatar')

const canBuyWeekly = computed(() => (userStore.user?.balance || 0) >= WEEKLY_CHEAP_PRICE)
const canBuyMonthly = computed(() => (userStore.user?.balance || 0) >= MONTHLY_PRO_PRICE)
const isSubscriptionExpired = computed(
	() => !!activeSubscription.value && Date.now() > activeSubscription.value.expiresAt,
)

const activeModeLabel = computed(() => {
	if (activeSubscription.value && !isSubscriptionExpired.value) {
		return activeSubscription.value.mode === 'weekly-cheap' ? 'Недельная дешёвая подписка' : 'Месячная премиум-подписка'
	}

	return 'Pay-per-request'
})

const getStorageKey = () => `billing_state_${userStore.user?.vkId || 'anonymous'}`

const saveBillingState = () => {
	localStorage.setItem(
		getStorageKey(),
		JSON.stringify({
			activeMode: activeMode.value,
			activeSubscription: activeSubscription.value,
		}),
	)
}

const loadBillingState = () => {
	const raw = localStorage.getItem(getStorageKey())
	if (!raw) return

	try {
		const parsed = JSON.parse(raw) as {
			activeMode?: BillingMode
			activeSubscription?: SubscriptionState | null
		}

		if (parsed.activeMode) activeMode.value = parsed.activeMode
		if (parsed.activeSubscription) activeSubscription.value = parsed.activeSubscription
	} catch (e) {
		console.error('Не удалось загрузить billing state', e)
	}
}

const clearStatusLater = () => {
	setTimeout(() => {
		statusMessage.value = ''
	}, 5000)
}

const setSuccess = (message: string) => {
	statusMessage.value = message
	clearStatusLater()
}

const setError = (message: string) => {
	statusMessage.value = `⚠️ ${message}`
	clearStatusLater()
}

const chargeBalance = (amount: number) => {
	if (!userStore.user) return false
	if (userStore.user.balance < amount) return false

	userStore.user.balance -= amount
	return true
}

const buyPlan = (plan: Exclude<BillingMode, 'payg'>) => {
	if (!userStore.user) return

	const isWeekly = plan === 'weekly-cheap'
	const price = isWeekly ? WEEKLY_CHEAP_PRICE : MONTHLY_PRO_PRICE
	const durationDays = isWeekly ? 7 : 30

	if (!chargeBalance(price)) {
		setError('Недостаточно средств на балансе. Пополните счёт и повторите покупку.')
		return
	}

	activeSubscription.value = {
		mode: plan,
		expiresAt: Date.now() + durationDays * 24 * 60 * 60 * 1000,
	}
	activeMode.value = plan
	saveBillingState()

	setSuccess(
		isWeekly
			? 'Недельная подписка на базовые модели активирована.'
			: 'Месячная подписка на специализированные модели активирована.',
	)
}

const activatePayg = () => {
	activeMode.value = 'payg'
	if (isSubscriptionExpired.value) {
		activeSubscription.value = null
	}
	saveBillingState()
	setSuccess('Режим Pay-per-request активирован.')
}

const formatDate = (timestamp: number) => new Date(timestamp).toLocaleString()

const handleRecharge = (amount: number) => {
	setSuccess(`Оплата подтверждена. Баланс пополнен на ${amount} ₽`)
}

watch(
	() => userStore.user?.vkId,
	newVkId => {
		if (!newVkId) return
		loadBillingState()
	},
	{ immediate: true },
)

watch([activeMode, activeSubscription], saveBillingState, { deep: true })

watch(isSubscriptionExpired, expired => {
	if (!expired) return
	activeMode.value = 'payg'
	activeSubscription.value = null
	saveBillingState()
	setError('Срок подписки закончился. Переключили на оплату за запрос.')
})
</script>
