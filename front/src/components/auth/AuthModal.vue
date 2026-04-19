<template>
	<Teleport to="body">
		<Transition name="modal">
			<div v-if="visible" class="modal-overlay auth-overlay" @click.self="noop">
				<div class="modal-container modal-container--auth" role="dialog" aria-modal="true" aria-labelledby="auth-title">
					<div class="auth-modal">
						<h2 id="auth-title" class="auth-title">Вход и регистрация</h2>
						<p class="auth-subtitle">Выберите способ входа. Аккаунт создаётся автоматически при первом логине.</p>

						<div class="auth-provider-list">
							<button
								class="auth-provider-btn auth-provider-btn--vk"
								:disabled="userStore.authPending"
								@click="login('vk')"
							>
								Войти через VK ID
							</button>
							<button
								class="auth-provider-btn auth-provider-btn--google"
								:disabled="userStore.authPending"
								@click="login('google')"
							>
								Войти через Google OAuth
							</button>
							<button
								class="auth-provider-btn auth-provider-btn--yandex"
								:disabled="userStore.authPending"
								@click="login('yandex')"
							>
								Войти через Яндекс OAuth
							</button>
						</div>

						<div class="auth-divider">или</div>

						<form class="phone-auth" @submit.prevent="handlePhoneCodeRequest">
							<label for="phone-input">Вход по номеру телефона</label>
							<input
								id="phone-input"
								ref="phoneInputRef"
								v-model="phone"
								type="tel"
								placeholder="+7 123 456 78 90"
								required
								autocomplete="tel"
								:disabled="userStore.authPending || !!userStore.phoneChallenge"
							/>
							<button
								type="submit"
								class="submit-btn"
								:disabled="userStore.authPending || normalizedPhone.length < 10 || !!userStore.phoneChallenge"
							>
								{{ userStore.authPending ? 'Отправляем...' : 'Получить код' }}
							</button>
						</form>

						<div v-if="userStore.phoneChallenge" class="code-step">
							<p>Код уже отправлен. Введите его или вставьте из SMS.</p>
							<div v-if="userStore.phoneChallenge.testCode" class="test-code-box">
								<span class="test-code-label">Debug code</span>
								<div class="test-code-value">{{ userStore.phoneChallenge.testCode }}</div>
							</div>

							<label for="sms-code-input">Код подтверждения</label>
							<input
								id="sms-code-input"
								ref="codeInputRef"
								v-model="smsCode"
								inputmode="numeric"
								autocomplete="one-time-code"
								enterkeyhint="done"
								maxlength="6"
								placeholder="6 цифр"
								:disabled="userStore.authPending"
								@paste="handlePaste"
							/>

							<div class="code-actions">
								<button
									type="button"
									class="submit-btn code-action-btn"
									:disabled="userStore.authPending || smsCode.length < 4"
									@click="verifyCodeNow"
								>
									Подтвердить
								</button>
								<button type="button" class="ghost-btn" :disabled="userStore.authPending" @click="resetPhoneStep">
									Изменить номер
								</button>
							</div>
						</div>

						<p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
					</div>
				</div>
			</div>
		</Transition>
	</Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useUserStore } from '../../stores/user'

defineProps<{ visible: boolean }>()
const emit = defineEmits<{ (e: 'authenticated'): void }>()

const userStore = useUserStore()
const phone = ref('')
const smsCode = ref('')
const errorMessage = ref('')
const phoneInputRef = ref<HTMLInputElement | null>(null)
const codeInputRef = ref<HTMLInputElement | null>(null)
const isVerifyingCode = ref(false)

const noop = () => {}
const PHONE_NATIONAL_LENGTH = 10

const extractNationalDigits = (value: string) => {
	const digits = value.replace(/\D/g, '')
	if (!digits) return ''

	if (digits.startsWith('7') || digits.startsWith('8')) {
		return digits.slice(1, PHONE_NATIONAL_LENGTH + 1)
	}

	if (digits.length > PHONE_NATIONAL_LENGTH) {
		return digits.slice(-PHONE_NATIONAL_LENGTH)
	}

	return digits.slice(0, PHONE_NATIONAL_LENGTH)
}

const formatPhone = (nationalDigits: string) => {
	if (!nationalDigits) return ''

	const part1 = nationalDigits.slice(0, 3)
	const part2 = nationalDigits.slice(3, 6)
	const part3 = nationalDigits.slice(6, 8)
	const part4 = nationalDigits.slice(8, 10)

	return ['+7', part1, part2, part3, part4].filter(Boolean).join(' ')
}

const normalizedPhone = computed(() => extractNationalDigits(phone.value))
const phoneE164 = computed(() =>
	normalizedPhone.value.length === PHONE_NATIONAL_LENGTH ? `+7${normalizedPhone.value}` : '',
)

const handleAuthSuccess = () => {
	errorMessage.value = ''
	smsCode.value = ''
	phone.value = ''
	userStore.phoneChallenge = null
	emit('authenticated')
}

const login = async (provider: 'vk' | 'google' | 'yandex') => {
	try {
		errorMessage.value = ''
		await userStore.loginByProvider(provider)
		handleAuthSuccess()
	} catch (error) {
		errorMessage.value = error instanceof Error ? error.message : 'Ошибка входа через OAuth.'
	}
}

const focusCodeInput = async () => {
	await nextTick()
	codeInputRef.value?.focus()
	codeInputRef.value?.select()
}

const verifyCodeNow = async () => {
	if (!userStore.phoneChallenge || !smsCode.value || isVerifyingCode.value) return

	try {
		isVerifyingCode.value = true
		errorMessage.value = ''
		await userStore.loginByPhone(smsCode.value)
		handleAuthSuccess()
	} catch (error) {
		errorMessage.value = error instanceof Error ? error.message : 'Ошибка проверки кода.'
	} finally {
		isVerifyingCode.value = false
	}
}

const handlePhoneCodeRequest = async () => {
	try {
		errorMessage.value = ''
		smsCode.value = ''
		const result = await userStore.sendPhoneCode(phoneE164.value)
		userStore.phoneChallenge = {
			challengeId: result.challengeId,
			expiresInSec: result.expiresInSec,
			testCode: result.debugCode ?? null,
		}

		if (result.debugCode) {
			smsCode.value = result.debugCode
			await verifyCodeNow()
			return
		}

		await focusCodeInput()
	} catch (error) {
		errorMessage.value = error instanceof Error ? error.message : 'Не удалось отправить код.'
	}
}

const handlePaste = async (event: ClipboardEvent) => {
	const pasted = event.clipboardData?.getData('text')?.replace(/\D/g, '').slice(0, 6) || ''
	if (!pasted) return
	event.preventDefault()
	smsCode.value = pasted
	if (pasted.length >= 4) {
		await verifyCodeNow()
	}
}

const resetPhoneStep = async () => {
	userStore.phoneChallenge = null
	smsCode.value = ''
	errorMessage.value = ''
	await nextTick()
	phoneInputRef.value?.focus()
}

watch(
	() => userStore.phoneChallenge,
	async challenge => {
		if (challenge) {
			await focusCodeInput()
		}
	},
)

watch(phone, value => {
	const formatted = formatPhone(extractNationalDigits(value))
	if (formatted !== value) {
		phone.value = formatted
	}
})

watch(smsCode, async value => {
	if (isVerifyingCode.value) return
	if (userStore.phoneChallenge?.testCode && value === userStore.phoneChallenge.testCode) {
		await verifyCodeNow()
		return
	}

	if (value.replace(/\D/g, '').length === 6) {
		await verifyCodeNow()
	}
})
</script>
