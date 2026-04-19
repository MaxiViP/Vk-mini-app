<template>
	<div>
		<div class="chat-model-selector">
			<div class="chat-model-selector__group">
				<label>🌐 Облачные</label>
				<CustomSelect
					:options="cloudOptions"
					:modelValue="selectedCloudModelId"
					@update:modelValue="onCloudChange"
					:disabled="modelsStore.isLoading"
					placeholder="Выберите модель"
				/>
			</div>

			<div class="chat-model-selector__group">
				<label>🧠 Локальные</label>
				<CustomSelect
					:options="localOptions"
					:modelValue="selectedLocalModelId"
					@update:modelValue="onLocalChange"
					:disabled="modelsStore.isLoading"
					placeholder="Выберите модель"
				/>
			</div>

			<div v-if="modelsStore.isLoading" class="loader">Загрузка моделей...</div>
			<div v-if="modelsStore.error" class="error">{{ modelsStore.error }}</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useModelsStore } from '../../stores/models'
import type { Model } from '../../types'
import CustomSelect from '../common/CustomSelect.vue'

const modelsStore = useModelsStore()

const cloudModels = computed<Model[]>(() => modelsStore.models.filter(m => m.provider !== 'local'))
const localModels = computed<Model[]>(() => modelsStore.models.filter(m => m.provider === 'local'))

const cloudOptions = computed(() => cloudModels.value.map(m => ({ value: m.id, label: m.name })))
const localOptions = computed(() => localModels.value.map(m => ({ value: m.id, label: m.name })))

const selectedCloudModelId = computed<string | null>(() => {
	const current = modelsStore.getCurrentModel()
	return current && current.provider !== 'local' ? current.id : null
})

const selectedLocalModelId = computed<string | null>(() => {
	const current = modelsStore.getCurrentModel()
	return current && current.provider === 'local' ? current.id : null
})

const onCloudChange = (modelId: string) => {
	modelsStore.selectModel(modelId)
}

const onLocalChange = (modelId: string) => {
	modelsStore.selectModel(modelId)
}
</script>

