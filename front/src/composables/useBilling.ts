import { computed, ref } from 'vue'

import type {
	AiAccessPlan,
	BillingLedgerEntry,
	BillingPayment,
	BillingPlan,
	SubscriptionPurchasePreview,
} from '../types'
import { canBuyPlanFromWallet } from '../domain/billingRules'
import { emptyAiCounters, normalizeAiCounters } from '../domain/aiSubscription'
import { useUserStore } from '../stores/user'

export const useBilling = () => {
	const userStore = useUserStore()
	const statusMessage = ref('')
	const statusKind = ref<'success' | 'error'>('success')
	const isBusy = ref(false)
	const isLoading = ref(false)
	const loadError = ref('')
	const planPromoCodes = ref<Record<string, string>>({})
	const planPreviews = ref<Record<string, SubscriptionPurchasePreview | null>>({})
	const planPreviewLoading = ref<Record<string, boolean>>({})

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
	const walletBalance = computed(() => userStore.billing?.wallet.balance ?? userStore.user?.balance ?? 0)
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

	const normalizePromoCode = (value?: string) => {
		const normalized = String(value || '').trim()
		return normalized || undefined
	}

	const getPlanPromoCode = (planCode: string) => planPromoCodes.value[planCode] || ''
	const getPlanPreview = (planCode: string) => planPreviews.value[planCode] || null
	const isPlanPreviewPending = (planCode: string) => Boolean(planPreviewLoading.value[planCode])

	const updatePlanPromoCode = (planCode: string, eventOrValue: Event | string) => {
		const value =
			typeof eventOrValue === 'string'
				? eventOrValue
				: (eventOrValue.target as HTMLInputElement | null)?.value || ''

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
			return preview
		} catch (error) {
			setError((error as Error).message || 'Не удалось получить preview тарифа.')
			throw error
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

	const planDescription = (planCode: string) => {
		if (planCode === 'monthly-premium') return 'Подходит для тяжёлых и специализированных сценариев'
		return 'Подходит для массовых базовых сценариев'
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

		if (payment.status === 'succeeded') return 'Пополнение подтверждено'
		if (payment.status === 'pending') return 'Платёж создан'
		if (payment.status === 'failed') return 'Платёж не прошёл'
		return 'Платёж отменён'
	}

	const paymentAmountLabel = (payment: BillingPayment) => {
		const creditedAmount = payment.creditedAmount ?? payment.amount
		const bonusAmount = payment.bonusAmount ?? 0

		if (bonusAmount > 0) {
			return `${formatMoney(creditedAmount)} ₽ (включая бонус ${formatMoney(bonusAmount)} ₽)`
		}

		return `${formatMoney(creditedAmount)} ₽`
	}

	const loadBilling = async (options: { silent?: boolean } = {}) => {
		if (isBusy.value) return null

		try {
			isBusy.value = true
			if (!options.silent) {
				isLoading.value = true
				loadError.value = ''
			}
			const result = await Promise.allSettled([
				userStore.syncProfileFromServer(),
				userStore.loadAiAccess(),
				userStore.loadAiPlans(),
			])

			const rejected = result.find(item => item.status === 'rejected')
			if (rejected && !userStore.billing) {
				throw (rejected as PromiseRejectedResult).reason
			}

			return result
		} catch (error) {
			loadError.value = (error as Error).message || 'Не удалось загрузить тарифы.'
			setError(loadError.value)
			throw error
		} finally {
			isBusy.value = false
			isLoading.value = false
		}
	}

	const reloadBilling = async () => {
		try {
			await loadBilling({ silent: true })
			setSuccess('Данные по биллингу обновлены.')
		} catch {
			// Status is set in loadBilling.
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
			return result
		} catch (error) {
			setError((error as Error).message || 'Не удалось купить подписку.')
			throw error
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
			return result
		} catch (error) {
			setError((error as Error).message || 'Не удалось купить AI-подписку.')
			throw error
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

	return {
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
		aiUsage,
		aiRemaining,
		aiPlans,
		availableBalanceMinor,
		walletBalance,
		recentLedger,
		recentPayments,
		automaticDiscounts,
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
		reloadBilling,
		buyPlan,
		buyAiPlan,
		handleRecharge,
		setError,
		setSuccess,
	}
}

export const formatMoney = (value: number) => Number(value || 0).toFixed(0)
export const formatMoneyMinor = (value?: number | null) => formatMoney(Number(value || 0) / 100)
export const formatDate = (value: string) => new Date(value).toLocaleString()
export const formatAiCounter = (value?: number | null) => Number(value ?? 0)
