<template>
	<Teleport to="body">
		<Transition name="modal">
			<div v-if="visible" class="modal-overlay auth-overlay" @click.self="noop">
				<div class="modal-container modal-container--auth" role="dialog" aria-modal="true" aria-labelledby="auth-title">
					<div class="auth-modal">
						<h2 id="auth-title" class="auth-title">Вход и регистрация</h2>
						<p class="auth-subtitle">Выберите способ входа. Аккаунт создаётся автоматически при первом логине.</p>

						<div class="auth-provider-list">
							<button class="auth-provider-btn auth-provider-btn--vk" :disabled="userStore.authPending" @click="login('vk')">
								Войти через VK ID
							</button>
							<button class="auth-provider-btn auth-provider-btn--google" :disabled="userStore.authPending" @click="login('google')">
								Войти через Google OAuth
							</button>
							<button class="auth-provider-btn auth-provider-btn--yandex" :disabled="userStore.authPending" @click="login('yandex')">
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
								placeholder="+7 999 123-45-67"
								required
								autocomplete="tel"
								:disabled="userStore.authPending || !!userStore.phoneChallenge"
							/>
							<button
								type="submit"
								class="submit-btn"
								:disabled="userStore.authPending || normalizedPhone.length < 11 || !!userStore.phoneChallenge"
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
								<button
									type="button"
									class="ghost-btn"
									:disabled="userStore.authPending"
									@click="resetPhoneStep"
								>
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
const normalizedPhone = computed(() => phone.value.replace(/\D/g, ''))

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
		const result = await userStore.sendPhoneCode(phone.value)
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

<style scoped>
.auth-overlay {
	z-index: 1200;
}

.modal-container--auth {
	max-width: 460px;
	width: 100%;
}

.auth-modal {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.auth-title {
	margin: 0;
}

.auth-subtitle {
	margin: 0;
	opacity: 0.8;
	font-size: 14px;
}

.auth-provider-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.auth-provider-btn,
.submit-btn,
.ghost-btn {
	width: 100%;
	padding: 10px 12px;
	border-radius: 12px;
	border: none;
	cursor: pointer;
	font-weight: 600;
}

.auth-provider-btn--vk {
	background: #2787f5;
	color: #fff;
}

.auth-provider-btn--google,
.auth-provider-btn--yandex,
.submit-btn {
	background: #f1f3f5;
	color: #111;
}

.ghost-btn {
	background: rgba(255, 255, 255, 0.08);
	color: #fff;
	border: 1px solid rgba(255, 255, 255, 0.1);
}

.phone-auth,
.code-step {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

input {
	padding: 10px;
	border: 1px solid #cfd4dc;
	border-radius: 10px;
}

.auth-divider {
	text-align: center;
	opacity: 0.7;
	font-size: 12px;
	margin: 2px 0;
}

.test-code-box {
	padding: 10px 12px;
	border-radius: 12px;
	background: rgba(255, 255, 255, 0.06);
}

.test-code-label {
	display: block;
	font-size: 11px;
	opacity: 0.75;
	margin-bottom: 4px;
}

.test-code-value {
	font-family: monospace;
	font-size: 20px;
	font-weight: 700;
	letter-spacing: 0.08em;
}

.code-actions {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
}

.code-action-btn {
	background: #fff;
}

.error-message {
	margin: 0;
	color: #d63939;
	font-size: 13px;
}

@media (max-width: 560px) {
	.code-actions {
		grid-template-columns: 1fr;
	}
}
</style>
