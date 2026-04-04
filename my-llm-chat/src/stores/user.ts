import { defineStore } from 'pinia'
import { ref } from 'vue'
import bridge from '@vkontakte/vk-bridge'
import type { User } from '../types'
import axios from 'axios'

export const useUserStore = defineStore('user', () => {
	const user = ref<User | null>(null)
	const token = ref<string | null>(null)

	async function initVKUser() {
		try {
			const vkUser = await bridge.send('VKWebAppGetUserInfo')
			// Отправляем на бэкенд для регистрации/получения JWT
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

	return { user, token, initVKUser, rechargeBalance, logout }
})
