<template>
	<div class="app">
		<ModelSelector />
		<Chat />
		<Profile />
	</div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { initVK } from './vk/bridge'
import { useModelsStore } from './stores/models'
import { useUserStore } from './stores/user'
import ModelSelector from './components/ModelSelector.vue'
import Chat from './components/Chat.vue'
import Profile from './components/Profile.vue'

const modelsStore = useModelsStore()
const userStore = useUserStore()

onMounted(async () => {
	await modelsStore.fetchModels()
	await userStore.initVKUser()
	initVK()
})
</script>
