import { defineStore } from 'pinia'
import { ref } from 'vue'
import bridge from '@vkontakte/vk-bridge'
import axios from 'axios'

export const useUserStore = defineStore('user', () => {
	const user = ref<any>(null)
	const token = ref<string | null>(null)
	const loading = ref(false)

	const loginVK = async () => {
		loading.value = true
		try {
			const vkUser = await bridge.send('VKWebAppGetUserInfo')
			// отправляем на бэкенд
			const res = await axios.post('https://your-backend.com/auth/vk', {
				vkId: vkUser.id,
				firstName: vkUser.first_name,
				lastName: vkUser.last_name,
				avatar: vkUser.photo_200,
			})
			user.value = res.data.user
			token.value = res.data.token
		} catch (e) {
			console.error(e)
		} finally {
			loading.value = false
		}
	}

	const logout = () => {
		user.value = null
		token.value = null
	}

	return { user, token, loading, loginVK, logout }
})
