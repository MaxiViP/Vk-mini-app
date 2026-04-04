<template>
  <div :class="['message', message.role]">
    <div class="avatar">{{ message.role === 'user' ? '👤' : '🤖' }}</div>
    <div class="bubble">
      <div class="content">{{ message.content }}</div>
    </div>
    <button
      v-if="message.role === 'assistant'"
      class="save-note"
      @click="saveToNotes"
      title="Сохранить в заметки"
    >
      📎
    </button>
  </div>
</template>

<script setup lang="ts">
import type { Message } from '../types'

const props = defineProps<{
  message: Message
  showLimits?: boolean
}>()

const saveToNotes = () => {
  const notesEvent = new CustomEvent('save-to-notes', {
    detail: { text: props.message.content }
  })
  window.dispatchEvent(notesEvent)
}
</script>

<style scoped>
.message {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
  animation: slideUp 0.2s ease-out;
}

/* Сообщение пользователя — прижимаем к правому краю */
.message.user {
  justify-content: flex-end;
  margin-left: auto;
}

/* Для пользователя меняем порядок: пузырь слева от аватара */
.message.user .avatar {
  order: 2;
}
.message.user .bubble {
  order: 1;
}

/* Для ассистента: элементы идут по порядку: аватар → пузырь → кнопка */
.message.assistant {
  justify-content: flex-start;
}

.avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  flex-shrink: 0;
  background: #2f2f2f;
}

.message.user .avatar {
  background: #3a3a3a;
}

.message.assistant .avatar {
  background: #2a2a2a;
}

.bubble {
  max-width: 75%;
  padding: 10px 14px;
  font-size: 15px;
  line-height: 1.4;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.message.user .bubble {
  background: #2f2f2f;
  color: #ececec;
  border-radius: 18px 18px 4px 18px;
}

.message.assistant .bubble {
  background: #343541;
  color: #ececec;
  border-radius: 18px 18px 18px 4px;
}

.content {
  margin-bottom: 4px;
}

/* Кнопка сохранения (только для ассистента) */
.save-note {
  background: transparent;
  border: none;
  font-size: 16px;
  cursor: pointer;
  opacity: 0.5;
  transition: opacity 0.2s, transform 0.1s;
  padding: 8px;
  margin-left: auto;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  align-self: center;
  border: #ececec 1px solid;
  
}

.save-note:hover {
  opacity: 1;
  background: rgba(255, 255, 255, 0.1);
  transform: scale(1.05);
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Адаптив для мобильных */
@media (max-width: 560px) {
  .avatar {
    width: 32px;
    height: 32px;
    font-size: 16px;
  }
  .bubble {
    max-width: 85%;
    font-size: 14px;
    padding: 8px 12px;
  }
  .save-note {
    font-size: 14px;
    width: 32px;
    height: 32px;
    padding: 6px;
  }
}
</style>