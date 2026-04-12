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

						<div class="modal-buttons">
							<button @click="submit" class="submit-btn" :disabled="!isValid || isLoading">
								{{ isLoading ? 'Создаём платёж...' : 'Создать платёж' }}
							</button>
							<button @click="close" class="cancel-btn">Отмена</button>
						</div>

						<p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
					</div>

					<div class="modal-content" v-else>
						<h3>YooKassa stub</h3>
						<p>Сумма: {{ amount }} ₽</p>
						<p class="stub-note">
							Backend уже создаёт запись платежа в базе. После подключения официального провайдера здесь останется
							тот же сценарий подтверждения, поменяется только реальный checkout.
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

import type { YooKassaPaymentSession } from '../../types'
import { useUserStore } from '../../stores/user'

const props = defineProps<{
	visible: boolean
}>()

const emit = defineEmits<{
	(e: 'update:visible', value: boolean): void
	(e: 'success', amount: number): void
}>()

const userStore = useUserStore()
const amount = ref<number>(100)
const errorMessage = ref('')
const isLoading = ref(false)
const step = ref<'form' | 'payment'>('form')
const paymentSession = ref<YooKassaPaymentSession | null>(null)

const isValid = computed(() => amount.value > 0 && !Number.isNaN(amount.value))

const resetState = () => {
	amount.value = 100
	errorMessage.value = ''
	step.value = 'form'
	paymentSession.value = null
	isLoading.value = false
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

const submit = async () => {
	if (!isValid.value) {
		errorMessage.value = 'Сумма должна быть больше 0 ₽'
		return
	}

	try {
		errorMessage.value = ''
		isLoading.value = true
		paymentSession.value = await userStore.createYooKassaPayment(amount.value)
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
		await userStore.confirmYooKassaPayment(paymentSession.value.paymentId, amount.value)
		emit('success', amount.value)
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
</script>
