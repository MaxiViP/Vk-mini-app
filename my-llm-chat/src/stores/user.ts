import { defineStore } from 'pinia'
import { ref } from 'vue'
import bridge from '@vkontakte/vk-bridge'
import type { User, YooKassaPaymentSession } from '../types'
import axios from 'axios'
import { confirmYooKassaPaymentRequest, createYooKassaPaymentRequest } from '../api/payments'

export const useUserStore = defineStore('user', () => {
	const user = ref<User | null>(null)
	const token = ref<string | null>(null)
	const isTestMode = ref(true) // переключи в false, когда нужен реальный VK

	async function initVKUser() {
		if (isTestMode.value) {
			// Тестовый пользователь
			user.value = {
				vkId: 'test123',
				firstName: 'Тестовый',
				lastName: 'Пользователь',
				photo_200: 'https://via.placeholder.com/200?text=Avatar',
				balance: 500,
				requestsLeft: 100,
			}
			token.value = 'fake-jwt-token'
			console.log('✅ Тестовый пользователь загружен')
			return
		}

		try {
			const vkUser = await bridge.send('VKWebAppGetUserInfo')
			const response = await axios.post('http://localhost:3000/auth/vk', {
				vkId: vkUser.id,
				firstName: vkUser.first_name,
				lastName: vkUser.last_name,
				avatar: vkUser.photo_200,
			})
			token.value = response.data.token
			user.value = response.data.user
		} catch (err) {
			console.error('VK init error', err)
		}
	}

	async function rechargeBalance(amount: number) {
		if (!token.value) return

		if (isTestMode.value) {
			// Тестовое пополнение
			if (user.value) {
				user.value.balance += amount
				user.value.requestsLeft += amount * 10
				console.log(`💰 Тестовый баланс пополнен на ${amount} ₽`)
			}
			return
		}

		const response = await axios.post(
			'http://localhost:3000/user/recharge',
			{ amount },
			{ headers: { Authorization: `Bearer ${token.value}` } },
		)
		if (user.value) {
			user.value.balance = response.data.balance
			user.value.requestsLeft = response.data.requestsLeft
		}
	}

	async function createYooKassaPayment(amount: number): Promise<YooKassaPaymentSession> {
		try {
			return await createYooKassaPaymentRequest(amount)
		} catch (error) {
			if (!isTestMode.value) throw error

			const paymentId = `stub_${Date.now()}`
			return {
				paymentId,
				amount,
				status: 'pending',
				confirmationUrl: `https://yookassa.ru/checkout/payments/v2/contract?paymentId=${paymentId}`,
				qrCodeDataUrl:
					'data:image/svg+xml;charset=UTF-8,' +
					encodeURIComponent(
						'<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220"><rect width="220" height="220" fill="white"/><rect x="10" y="10" width="200" height="200" fill="none" stroke="black" stroke-width="4"/><text x="110" y="110" text-anchor="middle" font-size="16" font-family="monospace">QR STUB</text></svg>',
					),
				qrPayload: `STUB://YOOKASSA/${paymentId}/AMOUNT/${amount}`,
				isStub: true,
			}
		}
	}

	async function confirmYooKassaPayment(paymentId: string, amount: number) {
		try {
			const response = await confirmYooKassaPaymentRequest(paymentId)
			await rechargeBalance(response.amount)
			return response
		} catch (error) {
			if (!isTestMode.value) throw error
			await rechargeBalance(amount)
			return { paymentId, status: 'succeeded' as const, isStub: true, amount }
		}
	}

	function logout() {
		user.value = null
		token.value = null
		localStorage.removeItem('token')
	}

	return {
		user,
		token,
		initVKUser,
		rechargeBalance,
		createYooKassaPayment,
		confirmYooKassaPayment,
		logout,
		isTestMode,
	}
})
