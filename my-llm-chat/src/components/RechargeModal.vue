<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="visible" class="modal-overlay" @click.self="close">
        <div class="modal-container">
          <button class="modal-close" @click="close">✕</button>
          <div class="modal-content">
            <h3>💰 Пополнение баланса</h3>
            <p>Минимальная сумма: 50 ₽</p>
            <input
              v-model.number="amount"
              type="number"
              min="50"
              step="10"
              placeholder="Введите сумму"
              class="amount-input"
              @keyup.enter="submit"
            />
            <div class="modal-buttons">
              <button @click="submit" class="submit-btn" :disabled="!isValid">Пополнить</button>
              <button @click="close" class="cancel-btn">Отмена</button>
            </div>
            <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'success', amount: number): void
}>()

const amount = ref<number>(100)
const errorMessage = ref('')

const isValid = computed(() => amount.value >= 50 && !isNaN(amount.value))

const close = () => {
  emit('update:visible', false)
  amount.value = 100
  errorMessage.value = ''
}

const submit = () => {
  if (!isValid.value) {
    errorMessage.value = 'Сумма должна быть не менее 50 ₽'
    return
  }
  emit('success', amount.value)
  close()
}

watch(() => props.visible, (val) => {
  if (!val) {
    amount.value = 100
    errorMessage.value = ''
  }
})
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1001;
}

.modal-container {
  position: relative;
  max-width: 400px;
  width: 90%;
  background: #2f2f2f;
  border-radius: 24px;
  padding: 24px;
}

.modal-close {
  position: absolute;
  top: 12px;
  right: 16px;
  background: rgba(255, 255, 255, 0.2);
  border: none;
  font-size: 20px;
  font-weight: bold;
  color: white;
  cursor: pointer;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-close:hover {
  background: rgba(255, 255, 255, 0.4);
}

.modal-content {
  text-align: center;
}

h3 {
  margin-top: 0;
  color: #ececec;
}

p {
  color: #aaa;
  margin-bottom: 16px;
}

.amount-input {
  width: 100%;
  padding: 12px;
  background: #1e1e1e;
  border: 1px solid #444;
  border-radius: 12px;
  color: white;
  font-size: 16px;
  margin-bottom: 20px;
  outline: none;
}

.amount-input:focus {
  border-color: #10a37f;
}

.modal-buttons {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.submit-btn, .cancel-btn {
  padding: 10px 20px;
  border: none;
  border-radius: 40px;
  font-weight: bold;
  cursor: pointer;
}

.submit-btn {
  background: #10a37f;
  color: white;
}

.submit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.cancel-btn {
  background: #444;
  color: #ececec;
}

.error-message {
  color: #ff6b6b;
  margin-top: 16px;
  font-size: 14px;
}

/* Анимация */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-active .modal-container,
.modal-leave-active .modal-container {
  transition: transform 0.2s ease;
}
.modal-enter-from .modal-container,
.modal-leave-to .modal-container {
  transform: scale(0.95);
}
</style>