<template>
  <div class="input">
    <div class="input-inner">
      <input
        v-model="text"
        @keydown.enter="submit"
        placeholder="Напишите сообщение..."
      />
      <button @click="submit">➤</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const emit = defineEmits(['send'])
const text = ref('')

const submit = () => {
  if (!text.value.trim()) return

  emit('send', text.value)
  text.value = ''
}
</script>