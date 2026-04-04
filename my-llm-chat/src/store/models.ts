import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useModelsStore = defineStore('models', () => {
	const models = ref([
		{ id: 'openrouter-gpt4o', name: 'GPT-4o' },
		{ id: 'groq-llama', name: 'Llama 3.3 70B' },
		{ id: 'my-marketing', name: 'Маркетолог' },
		{ id: 'my-legal', name: 'Юрист' },
	])

	const selectedModel = ref(models.value[0].id)

	return {
		models,
		selectedModel,
	}
})
