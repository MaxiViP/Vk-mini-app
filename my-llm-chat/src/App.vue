<template>
  <div class="app">
    <ModelSelector />
    <Chat />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { initVK } from './vk/bridge'
import ModelSelector from './components/ModelSelector.vue'
import Chat from './components/Chat.vue'

onMounted(() => {
  initVK()
})
</script>