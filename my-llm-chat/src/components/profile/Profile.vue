<template>
	<div class="profile">
		<template v-if="userStore.user">
			<img :src="userStore.user.photo_200" alt="avatar" class="profile-avatar" />
			<h2>{{ userStore.user.firstName }} {{ userStore.user.lastName }}</h2>
			<p>💰 Баланс: {{ userStore.user.balance }} ₽</p>
			<p>🎫 Осталось запросов: {{ userStore.user.requestsLeft }}</p>
			<p v-if="statusMessage" class="profile-status">{{ statusMessage }}</p>

			<div class="profile-actions">
				<button @click="showRechargeModal = true" class="recharge-btn">Пополнить</button>
				<button @click="userStore.logout" class="logout-btn">Выйти</button>
			</div>
		</template>

		<div v-else class="loading">
			<p>Загрузка данных пользователя...</p>
		</div>

		<RechargeModal v-model:visible="showRechargeModal" @success="handleRecharge" />
	</div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useUserStore } from '../../stores/user'
import RechargeModal from './RechargeModal.vue'

const userStore = useUserStore()
const showRechargeModal = ref(false)
const statusMessage = ref('')

const handleRecharge = (amount: number) => {
	statusMessage.value = `Оплата подтверждена. Баланс пополнен на ${amount} ₽`
	setTimeout(() => {
		statusMessage.value = ''
	}, 4000)
}
</script>
