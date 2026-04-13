<template>
	<div>
		<div class="model-selector">
			<div class="dropdown-group">
				<label>🌐 Облачные</label>
				<CustomSelect
					:options="cloudOptions"
					:modelValue="selectedCloudModelId"
					@update:modelValue="onCloudChange"
					:disabled="modelsStore.isLoading"
					placeholder="Выберите модель"
				/>
			</div>

			<div class="dropdown-group">
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

<style scoped>
.model-selector {
	display: flex;
	justify-content: center;
	align-items: flex-start;
	gap: 24px;
	flex-wrap: wrap;
	padding: 12px 16px;
	background: rgba(0, 0, 0, 0.3);
	border-radius: 16px;
	margin-bottom: 8px;
}

.dropdown-group {
	display: flex;
	align-items: center;
	gap: 12px;
	flex: 1 1 40px;
	min-width: 200px;
}

.dropdown-group label {
	font-size: 13px;
	font-weight: 500;
	color: #ccc;
	white-space: nowrap;
}

.loader,
.error {
	font-size: 12px;
	margin-top: 6px;
	text-align: center;
	width: 100%;
}

.error {
	color: #ff6b6b;
}

@media (max-width: 640px) {
	.model-selector {
		flex-direction: column;
		align-items: stretch;
		gap: 16px;
	}
	.dropdown-group {
		width: 100%;
	}
}
</style>
