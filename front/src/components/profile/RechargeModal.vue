<template>
	<Teleport to="body">
		<Transition name="modal">
			<div v-if="visible" class="modal-overlay" @click.self="close">
				<div class="modal-container modal-container--recharge">
					<button class="modal-close" @click="close">×</button>

					<div class="modal-content" v-if="step === 'form'">
						<h3>Пополнение баланса</h3>
						<p>Можно создать stub-платёж на любую сумму до подключения реальной оплаты.</p>

						<input
							v-model.number="amount"
							type="number"
							min="1"
							step="1"
							placeholder="Введите сумму"
							class="amount-input"
							@keyup.enter="submit"
						/>

						<input
							v-model.trim="promoCode"
							type="text"
							placeholder="Промокод"
							class="amount-input promo-code-input"
						/>

						<div class="modal-buttons">
							<button @click="loadPreview" class="cancel-btn" :disabled="!isValid || isLoading">
								{{ isLoadingPreview ? 'Проверяем...' : promoCode ? 'Применить' : 'Проверить бонус' }}
							</button>
							<button @click="submit" class="submit-btn" :disabled="!isValid || isLoading">
								{{ isLoading ? 'Создаём платёж...' : 'Создать платёж' }}
							</button>
						</div>

						<div v-if="preview" class="recharge-preview">
							<p>Сумма пополнения: <b>{{ formatMoneyMinor(preview.baseAmountMinor) }} ₽</b></p>
							<p>Бонус: <b>{{ formatMoneyMinor(preview.bonusMinor) }} ₽</b></p>
							<p>Будет зачислено: <b>{{ formatMoneyMinor(preview.creditedAmountMinor) }} ₽</b></p>
							<p v-if="preview.appliedDiscount" class="recharge-preview__discount">
								Применено: {{ preview.appliedDiscount.name }}
							</p>
							<p v-if="preview.message" class="stub-note">{{ preview.message }}</p>
						</div>

						<p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
					</div>

					<div class="modal-content" v-else>
						<h3>YooKassa stub</h3>
						<p>Сумма: {{ amount }} ₽</p>
						<p v-if="paymentSession?.bonusMinor" class="stub-note">
							Будет зачислено {{ formatMoneyMinor(paymentSession?.creditedAmountMinor) }} ₽, включая бонус
							{{ formatMoneyMinor(paymentSession?.bonusMinor) }} ₽.
						</p>
						<p v-if="paymentSession?.appliedDiscount" class="stub-note">
							Акция: {{ paymentSession.appliedDiscount.name }}
						</p>
						<p class="stub-note">
							Backend уже создаёт запись платежа в базе. После подключения официального провайдера останется тот же
							сценарий подтверждения, поменяется только реальный checkout.
						</p>

						<img
							v-if="paymentSession"
							:src="paymentSession.qrCodeDataUrl"
							alt="QR для пополнения"
							class="qr-code-image"
						/>
						<p class="qr-caption">ID платежа: {{ paymentSession?.paymentId }}</p>

						<a
							v-if="paymentSession"
							:href="paymentSession.confirmationUrl"
							target="_blank"
							rel="noopener noreferrer"
							class="payment-link"
						>
							Открыть страницу оплаты
						</a>

						<div class="modal-buttons">
							<button @click="confirmPayment" class="submit-btn" :disabled="isLoading">
								{{ isLoading ? 'Проверяем...' : 'Я оплатил, проверить' }}
							</button>
							<button @click="resetToForm" class="cancel-btn">Назад</button>
						</div>

						<p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
					</div>
				</div>
			</div>
		</Transition>
	</Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import type { TopupPreview, YooKassaPaymentSession } from '../../types'
import { useUserStore } from '../../stores/user'

const props = defineProps<{
	visible: boolean
}>()

const emit = defineEmits<{
	(e: 'update:visible', value: boolean): void
	(e: 'success', payload: { creditedAmount: number; bonusMinor: number; discountName?: string | null }): void
}>()

const userStore = useUserStore()
const amount = ref<number>(100)
const promoCode = ref('')
const preview = ref<TopupPreview | null>(null)
const errorMessage = ref('')
const isLoading = ref(false)
const isLoadingPreview = ref(false)
const step = ref<'form' | 'payment'>('form')
const paymentSession = ref<YooKassaPaymentSession | null>(null)

const isValid = computed(() => amount.value > 0 && !Number.isNaN(amount.value))
const normalizedPromoCode = computed(() => {
	const value = promoCode.value.trim()
	return value || undefined
})

const formatMoneyMinor = (value?: number | null) => (Number(value || 0) / 100).toFixed(0)

const resetState = () => {
	amount.value = 100
	promoCode.value = ''
	preview.value = null
	errorMessage.value = ''
	step.value = 'form'
	paymentSession.value = null
	isLoading.value = false
	isLoadingPreview.value = false
}

const close = () => {
	emit('update:visible', false)
	resetState()
}

const resetToForm = () => {
	errorMessage.value = ''
	step.value = 'form'
	paymentSession.value = null
}

const loadPreview = async () => {
	if (!isValid.value) {
		errorMessage.value = 'Сумма должна быть больше 0 ₽'
		return
	}

	try {
		errorMessage.value = ''
		isLoadingPreview.value = true
		preview.value = await userStore.previewTopup(amount.value, normalizedPromoCode.value)
	} catch (error) {
		errorMessage.value = (error as Error).message || 'Не удалось получить preview пополнения.'
	} finally {
		isLoadingPreview.value = false
	}
}

const submit = async () => {
	if (!isValid.value) {
		errorMessage.value = 'Сумма должна быть больше 0 ₽'
		return
	}

	try {
		errorMessage.value = ''
		isLoading.value = true
		if (!preview.value) {
			preview.value = await userStore.previewTopup(amount.value, normalizedPromoCode.value)
		}
		paymentSession.value = await userStore.createYooKassaPayment(amount.value, normalizedPromoCode.value)
		step.value = 'payment'
	} catch (error) {
		errorMessage.value = (error as Error).message || 'Не удалось создать платёж.'
	} finally {
		isLoading.value = false
	}
}

const confirmPayment = async () => {
	if (!paymentSession.value) return

	try {
		errorMessage.value = ''
		isLoading.value = true
		const result = await userStore.confirmYooKassaPayment(paymentSession.value.paymentId, amount.value)
		emit('success', {
			creditedAmount: result.amount,
			bonusMinor: result.bonusMinor || 0,
			discountName: result.appliedDiscount?.name || null,
		})
		close()
	} catch (error) {
		errorMessage.value = (error as Error).message || 'Оплата пока не подтверждена.'
	} finally {
		isLoading.value = false
	}
}

watch(
	() => props.visible,
	value => {
		if (!value) resetState()
	},
)

watch([amount, promoCode], () => {
	preview.value = null
})
</script>
