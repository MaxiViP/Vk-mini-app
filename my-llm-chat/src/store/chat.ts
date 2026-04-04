import { defineStore } from 'pinia'
import { ref } from 'vue'
import { sendMessageStream } from '../api/chat'
import { useModelsStore } from './models'

export const useChatStore = defineStore('chat', () => {
	const messages = ref<any[]>([])
	const loading = ref(false)

	const sendMessage = async (text: string) => {
		const modelsStore = useModelsStore()

		const userMessage = {
			role: 'user',
			content: text,
		}

		const assistantMessage = {
			role: 'assistant',
			content: '',
		}

		messages.value.push(userMessage)
		messages.value.push(assistantMessage)

		loading.value = true

		await sendMessageStream(
			text,
			modelsStore.selectedModel,
			messages.value,
			chunk => {
				assistantMessage.content += chunk
			},
			() => {
				loading.value = false
			},
		)
	}

	return {
		messages,
		loading,
		sendMessage,
	}
})
