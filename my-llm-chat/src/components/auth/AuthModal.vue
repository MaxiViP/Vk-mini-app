<template>
	<Teleport to="body">
		<Transition name="modal">
			<div v-if="visible" class="modal-overlay auth-overlay" @click.self="noop">
				<div class="modal-container modal-container--auth" role="dialog" aria-modal="true" aria-labelledby="auth-title">
					<div class="auth-modal">
						<h2 id="auth-title" class="auth-title">Вход и регистрация</h2>
						<p class="auth-subtitle">Выберите способ входа. Регистрация создаётся автоматически при первом логине.</p>

						<div class="auth-provider-list">
							<button class="auth-provider-btn auth-provider-btn--vk" :disabled="userStore.authPending" @click="login('vk')">
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
								v-model="phone"
								type="tel"
								placeholder="+7 (999) 123-45-67"
								required
								:disabled="userStore.authPending"
							/>
							<button type="submit" class="submit-btn" :disabled="userStore.authPending || phone.length < 10">
								Получить код
							</button>
						</form>

						<div v-if="userStore.phoneChallenge" class="code-step">
							<details class="test-code-dropdown" open>
								<summary>Тестовый код для разработки</summary>
								<div class="test-code-value">{{ userStore.phoneChallenge.testCode }}</div>
							</details>

							<form @submit.prevent="handlePhoneLogin">
								<label for="sms-code-input">Код из SMS</label>
								<input
									id="sms-code-input"
									v-model="smsCode"
									inputmode="numeric"
									maxlength="6"
									placeholder="Введите 6 цифр"
									required
									:disabled="userStore.authPending"
								/>
								<button type="submit" class="submit-btn" :disabled="userStore.authPending || smsCode.length !== 6">
									Подтвердить и войти
								</button>
							</form>
						</div>

						<div class="auth-divider">временный доступ для разработки</div>
						<button class="admin-dev-btn" :disabled="userStore.authPending" @click="loginDevAdmin">Войти как админ (dev)</button>

						<p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
					</div>
				</div>
			</div>
		</Transition>
	</Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue'

import { useUserStore } from '../../stores/user'

defineProps<{ visible: boolean }>()
const emit = defineEmits<{ (e: 'authenticated'): void }>()

const userStore = useUserStore()
const phone = ref('')
const smsCode = ref('')
const errorMessage = ref('')

const noop = () => {}

const handleAuthSuccess = () => {
	errorMessage.value = ''
	smsCode.value = ''
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

const handlePhoneCodeRequest = async () => {
	try {
		errorMessage.value = ''
		smsCode.value = ''
		await userStore.sendPhoneCode(phone.value)
	} catch (error) {
		errorMessage.value = error instanceof Error ? error.message : 'Не удалось отправить код.'
	}
}

const handlePhoneLogin = async () => {
	try {
		errorMessage.value = ''
		await userStore.loginByPhone(smsCode.value)
		handleAuthSuccess()
	} catch (error) {
		errorMessage.value = error instanceof Error ? error.message : 'Ошибка проверки кода.'
	}
}

const loginDevAdmin = async () => {
	try {
		errorMessage.value = ''
		await userStore.loginAsDevAdmin()
		handleAuthSuccess()
	} catch (error) {
		errorMessage.value = error instanceof Error ? error.message : 'Не удалось войти как dev-admin.'
	}
}
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
.admin-dev-btn {
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

.admin-dev-btn {
	background: #111827;
	color: #fff;
}

.phone-auth,
.code-step form {
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

.test-code-dropdown {
	font-size: 13px;
}

.test-code-value {
	font-family: monospace;
	font-size: 18px;
	font-weight: 700;
	margin-top: 6px;
}

.error-message {
	margin: 0;
	color: #d63939;
	font-size: 13px;
}
</style>