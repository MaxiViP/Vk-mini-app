<template>
  <div :class="['message', message.role]">
    {{ message.content }}
  </div>
</template>

<script setup lang="ts">
defineProps<{
  message: {
    role: string
    content: string
  }
}>()
</script>