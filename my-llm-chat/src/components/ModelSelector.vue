<template>
  <select v-model="modelsStore.selectedModel">
    <option
      v-for="model in modelsStore.models"
      :key="model.id"
      :value="model.id"
    >
      {{ model.name }}
    </option>
  </select>
</template>

<script setup lang="ts">
import { useModelsStore } from '../store/models'

const modelsStore = useModelsStore()
</script>