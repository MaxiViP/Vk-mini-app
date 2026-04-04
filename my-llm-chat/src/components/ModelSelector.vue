<template>
  <div class="model-selector">
    <select
      v-model="selectedId"
      @change="onChange"
      :disabled="modelsStore.isLoading"
    >
      <option v-for="model in modelsStore.models" :key="model.id" :value="model.id">
        {{ model.name }}
      </option>
    </select>
    <div v-if="modelsStore.isLoading" class="loader">Загрузка моделей...</div>
    <div v-if="modelsStore.error" class="error">{{ modelsStore.error }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useModelsStore } from '../stores/models'

const modelsStore = useModelsStore()

const selectedId = computed({
  get: () => modelsStore.selectedModel,
  set: (val: string | null) => {
    if (val) modelsStore.selectModel(val)
  }
})

function onChange(event: Event) {
  const target = event.target as HTMLSelectElement
  modelsStore.selectModel(target.value)
}
</script>

<style scoped>
.model-selector {
  text-align: center;
  margin-bottom: 8px;
}
.loader, .error {
  font-size: 12px;
  margin-top: 6px;
}
.error {
  color: #ff6b6b;
}
</style>