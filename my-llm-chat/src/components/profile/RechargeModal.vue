<template>
	<Teleport to="body">
		<Transition name="modal">
			<div v-if="visible" class="modal-overlay" @click.self="close">
				<div class="modal-container modal-container--recharge">
					<button class="modal-close" @click="close">✕</button>

					<div class="modal-content" v-if="step === 'form'">
						<h3>💰 Пополнение баланса</h3>
						<p>Минимальная сумма: 50 ₽</p>

						<input
							v-model.number="amount"
							type="number"
							min="50"
							step="10"
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
						<h3>💳 YooKassa (заглушка)</h3>
						<p>Сумма: {{ amount }} ₽</p>
						<p class="stub-note">
							Сейчас подключена тестовая интеграция. ID магазина/секрет внесём позже.
						</p>

						<img v-if="paymentSession" :src="paymentSession.qrCodeDataUrl" alt="QR для пополнения" class="qr-code-image" />
						<p class="qr-caption">Отсканируйте QR-код для оплаты</p>

						<a
							v-if="paymentSession"
							:href="paymentSession.confirmationUrl"
							target="_blank"
							rel="noopener noreferrer"
							class="payment-link"
						>
							Открыть страницу оплаты YooKassa
						</a>

						<div class="modal-buttons">
							<button @click="confirmPayment" class="submit-btn" :disabled="isLoading">
								{{ isLoading ? 'Проверяем...' : 'Я оплатил (проверить)' }}
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
import { useUserStore } from '../../stores/user'
import type { YooKassaPaymentSession } from '../../types'

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

const isValid = computed(() => amount.value >= 50 && !isNaN(amount.value))

const close = () => {
	emit('update:visible', false)
	resetState()
}

const resetState = () => {
	amount.value = 100
	errorMessage.value = ''
	step.value = 'form'
	paymentSession.value = null
	isLoading.value = false
}

const resetToForm = () => {
	errorMessage.value = ''
	step.value = 'form'
	paymentSession.value = null
}

const submit = async () => {
	if (!isValid.value) {
		errorMessage.value = 'Сумма должна быть не менее 50 ₽'
		return
	}

	try {
		errorMessage.value = ''
		isLoading.value = true
		paymentSession.value = await userStore.createYooKassaPayment(amount.value)
		step.value = 'payment'
	} catch (error) {
		console.error(error)
		errorMessage.value = 'Не удалось создать платёж. Попробуйте позже.'
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
		console.error(error)
		errorMessage.value = 'Оплата пока не подтверждена. Проверьте позже.'
	} finally {
		isLoading.value = false
	}
}

watch(
	() => props.visible,
	val => {
		if (!val) {
			resetState()
		}
	},
)
</script>
