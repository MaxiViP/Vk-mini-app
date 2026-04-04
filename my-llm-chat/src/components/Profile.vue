<template>
  <div v-if="userStore.user" class="profile">
    <img :src="userStore.user.photo_200" alt="avatar" class="avatar" />
    <h2>{{ userStore.user.firstName }} {{ userStore.user.lastName }}</h2>
    <p>💰 Баланс: {{ userStore.user.balance }} ₽</p>
    <p>🎫 Осталось запросов: {{ userStore.user.requestsLeft }}</p>
    <button @click="recharge" class="recharge-btn">Пополнить</button>
    <button @click="userStore.logout" class="logout-btn">Выйти</button>
  </div>
  <!-- <div v-else class="profile loading">
    <p>Загрузка...</p>
  </div> -->
</template>

<script setup lang="ts">
import { useUserStore } from '../stores/user'

const userStore = useUserStore()

const recharge = async () => {
  const amount = parseInt(prompt('Сумма пополнения (₽)', '100') || '0')
  if (amount < 50) return alert('Минимум 50 ₽')
  await userStore.rechargeBalance(amount)
  alert(`Баланс пополнен на ${amount} ₽`)
}
</script>

<style scoped>
.profile {
  background: #2f2f2f;
  border-radius: 24px;
  padding: 24px;
  margin: 16px;
  text-align: center;
}
.avatar {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid #10a37f;
}
button {
  margin: 8px;
  padding: 8px 16px;
  border: none;
  border-radius: 40px;
  font-weight: bold;
  cursor: pointer;
}
.recharge-btn {
  background: #10a37f;
  color: white;
}
.logout-btn {
  background: #444;
  color: #ececec;
}
</style>