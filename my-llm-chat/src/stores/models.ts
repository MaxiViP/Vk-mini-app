import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios from 'axios'
import type { Model } from '../types'

export const useModelsStore = defineStore('models', () => {
	const models = ref<Model[]>([]) // 👈 явный тип
	const selectedModel = ref<string | null>(null)
	const isLoading = ref(false)
	const error = ref<string | null>(null)

	async function fetchModels() {
		isLoading.value = true
		error.value = null
		try {
			const response = await axios.get<Model[]>('http://localhost:3000/api/models')
			models.value = response.data

			const savedModelId = localStorage.getItem('selectedModelId')
			if (savedModelId && models.value.find(m => m.id === savedModelId)) {
				selectedModel.value = savedModelId
			} else if (models.value.length > 0) {
				selectedModel.value = models.value[0].id
			}

			if (selectedModel.value) {
				localStorage.setItem('selectedModelId', selectedModel.value)
			}
		} catch (err) {
			console.error(err)
			error.value = 'Не удалось загрузить модели'
			// fallback с правильным типом
			models.value = [
				{ id: 'openrouter-gpt4o', name: 'GPT-4o (OpenRouter)', provider: 'openrouter', model: 'openai/gpt-4o' },
				{ id: 'groq-llama', name: 'Llama 3.3 70B (Groq)', provider: 'groq', model: 'llama-3.3-70b-versatile' },
			]
			selectedModel.value = models.value[0]?.id || null
		} finally {
			isLoading.value = false
		}
	}

	function selectModel(modelId: string) {
		const modelExists = models.value.find(m => m.id === modelId)
		if (modelExists) {
			selectedModel.value = modelId
			localStorage.setItem('selectedModelId', modelId)
		}
	}

	function getCurrentModel(): Model | null {
		return models.value.find(m => m.id === selectedModel.value) || null
	}

	return {
		models,
		selectedModel,
		isLoading,
		error,
		fetchModels,
		selectModel,
		getCurrentModel,
	}
})
