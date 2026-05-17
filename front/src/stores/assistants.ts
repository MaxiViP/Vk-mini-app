import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { ASSISTANT_PRESETS } from '../data/assistantPresets'

const SELECTED_ASSISTANT_STORAGE_KEY = 'vk-mini-app:selected-assistant-id'

export const useAssistantsStore = defineStore('assistants', () => {
	const selectedAssistantId = ref(localStorage.getItem(SELECTED_ASSISTANT_STORAGE_KEY) || '')

	const selectedAssistant = computed(
		() => ASSISTANT_PRESETS.find(preset => preset.id === selectedAssistantId.value && !preset.isHidden) || null,
	)

	const selectAssistant = (assistantId: string) => {
		selectedAssistantId.value = assistantId
		localStorage.setItem(SELECTED_ASSISTANT_STORAGE_KEY, assistantId)
	}

	const clearAssistant = () => {
		selectedAssistantId.value = ''
		localStorage.removeItem(SELECTED_ASSISTANT_STORAGE_KEY)
	}

	return {
		selectedAssistantId,
		selectedAssistant,
		selectAssistant,
		clearAssistant,
	}
})
