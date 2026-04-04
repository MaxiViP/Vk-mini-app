<template>
  <div class="chat">
    <div class="messages">
      <Message
        v-for="(msg, i) in chat.messages"
        :key="i"
        :message="msg"
      />
    </div>

    <ChatInput @send="chat.sendMessage" />
  </div>
</template>

<script setup lang="ts">
import { useChatStore } from '../store/chat'
import Message from './Message.vue'
import ChatInput from './ChatInput.vue'

const chat = useChatStore()
</script>