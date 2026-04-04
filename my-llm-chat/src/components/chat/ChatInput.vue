<template>
  <div class="input">
    <div class="input-inner">
      <input
        v-model="text"
        @keydown.enter.prevent="submit"
        placeholder="Напишите сообщение..."
        :disabled="disabled"
      />
      <button @click="submit" :disabled="disabled || !text.trim()">
        ➤
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'send', message: string): void
}>()

const text = ref('')

const submit = () => {
  if (!text.value.trim() || props.disabled) return
  emit('send', text.value)
  text.value = ''
}
</script>