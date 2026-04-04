<template>
	<div v-if="userStore.user" class="profile">
		<img :src="userStore.user.avatar" alt="avatar" class="avatar" />
		<h2>{{ userStore.user.firstName }} {{ userStore.user.lastName }}</h2>
		<p>Баланс: {{ userStore.user.balance }} ₽</p>
		<p>Оставшиеся запросы: {{ userStore.user.requestsLeft }}</p>
		<button @click="recharge">Пополнить</button>
		<button @click="userStore.logout">Выйти</button>
	</div>
</template>

<script setup lang="ts">
import { useUserStore } from '../store/user'
import axios from 'axios'

const userStore = useUserStore()

const recharge = async () => {
	const amount = parseInt(prompt('Введите сумму для пополнения') || '0')
	if (amount <= 0) return

	// простой пример пополнения
	await axios.post(
		'https://your-backend.com/user/recharge',
		{ amount },
		{
			headers: { Authorization: `Bearer ${userStore.token}` },
		},
	)

	alert('Баланс пополнен')
}
</script>

<style>
.profile {
	padding: 20px;
	text-align: center;
}
.avatar {
	width: 100px;
	border-radius: 50%;
}
button {
	margin: 10px;
	padding: 8px 16px;
	border-radius: 8px;
	background: #10a37f;
	color: white;
	border: none;
	cursor: pointer;
}
button:hover {
	background: #0d8a6c;
}
</style>
