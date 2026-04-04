<template>
  <div class="profile">
    <template v-if="userStore.user">
      <img :src="userStore.user.photo_200" alt="avatar" class="avatar" />
      <h2>{{ userStore.user.firstName }} {{ userStore.user.lastName }}</h2>
      <p>💰 Баланс: {{ userStore.user.balance }} ₽</p>
      <p>🎫 Осталось запросов: {{ userStore.user.requestsLeft }}</p>
      <button @click="showRechargeModal = true" class="recharge-btn">Пополнить</button>
      <button @click="userStore.logout" class="logout-btn">Выйти</button>
    </template>
    <div v-else class="loading">
      <p>Загрузка данных пользователя...</p>
    </div>

    <!-- Модальное окно пополнения -->
    <RechargeModal
      v-model:visible="showRechargeModal"
      @success="handleRecharge"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useUserStore } from '../stores/user'
import RechargeModal from './RechargeModal.vue'

const userStore = useUserStore()
const showRechargeModal = ref(false)

const handleRecharge = async (amount: number) => {
  try {
    await userStore.rechargeBalance(amount)
    // Можно показать временное уведомление (например, через alert или добавить тост)
    alert(`Баланс успешно пополнен на ${amount} ₽`)
  } catch (err) {
    alert('Ошибка пополнения')
  }
}
</script>

<style scoped>
/* остальные стили без изменений */
.profile {
  background: #2f2f2f;
  border-radius: 24px;
  padding: 24px;
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
.loading {
  color: #ccc;
  text-align: center;
  padding: 20px;
}
</style>