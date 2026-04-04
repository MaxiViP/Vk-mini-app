import { defineStore } from 'pinia'
import { ref } from 'vue'
import bridge from '@vkontakte/vk-bridge'
import type { User } from '../types'
import axios from 'axios'

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

	function logout() {
		user.value = null
		token.value = null
		localStorage.removeItem('token')
	}

	return { user, token, initVKUser, rechargeBalance, logout, isTestMode }
})
