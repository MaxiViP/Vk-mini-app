<template>
  <div :class="['message', message.role]">
    {{ message.content }}
  </div>
</template>

<script setup lang="ts">
import type { Message } from '../types'

defineProps<{
  message: Message
}>()
</script>