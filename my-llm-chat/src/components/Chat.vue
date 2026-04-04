<template>
  <div class="chat">
    <div class="messages">
      <Message
        v-for="(msg, idx) in chat.messages"
        :key="idx"
        :message="msg"
      />
      <div v-if="chat.isLoading" class="message assistant typing-indicator">
        Печатает...
      </div>
    </div>
    <ChatInput @send="sendWithFallback" :disabled="chat.isLoading" />
  </div>
</template>

<script setup lang="ts">
import { useChatStore } from '../stores/chat'
import { useModelsStore } from '../stores/models'
import Message from './Message.vue'
import ChatInput from './ChatInput.vue'
import type { Model } from '../types'

const chat = useChatStore()
const modelsStore = useModelsStore()

// Функция, которая перебирает модели при ошибке
async function sendWithFallback(messageText: string) {
  // Получаем текущую выбранную модель
  let currentModel = modelsStore.getCurrentModel()
  if (!currentModel) return

  // Список моделей для перебора: начинаем с текущей, затем все остальные
  const allModels = modelsStore.models
  const startIndex = allModels.findIndex(m => m.id === currentModel?.id)
  const orderedModels = [
    ...allModels.slice(startIndex),
    ...allModels.slice(0, startIndex)
  ]

  let lastError: Error | null = null

  for (const model of orderedModels) {
    try {
      // Пробуем отправить сообщение через текущую модель
      await chat.sendMessage(messageText, model)
      // Если успешно – выходим, сохраняем эту модель как выбранную (опционально)
      if (model.id !== currentModel?.id) {
        modelsStore.selectModel(model.id)
        console.log(`✅ Переключились на рабочую модель: ${model.name}`)
      }
      return // успех, прерываем цикл
    } catch (error) {
      console.warn(`⚠️ Модель ${model.name} не ответила:`, error)
      lastError = error as Error
      // Добавляем временное сообщение в чат о неудаче (опционально)
      chat.addSystemMessage(`Модель "${model.name}" не ответила, пробуем другую...`)
      continue
    }
  }

  // Если все модели не сработали
  chat.addSystemMessage(`❌ Ни одна модель не ответила. Последняя ошибка: ${lastError?.message}`)
}
</script>