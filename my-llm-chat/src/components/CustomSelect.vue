<!-- components/CustomSelect.vue -->
<template>
  <div class="custom-select" :class="{ open, disabled }" ref="selectRef">
    <div class="select-trigger" @click="toggleDropdown">
      <span class="selected-value">{{ selectedLabel || placeholder }}</span>
      <span class="arrow" :class="{ rotated: open }">▼</span>
    </div>
    <ul class="dropdown-list" v-show="open">
      <li
        v-for="option in options"
        :key="option.value"
        @click="selectOption(option.value)"
        :class="{ active: option.value === modelValue }"
      >
        {{ option.label }}
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

interface Option {
  value: string
  label: string
}

const props = defineProps<{
  options: Option[]
  modelValue: string | null
  placeholder?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const open = ref(false)
const selectRef = ref<HTMLElement | null>(null)

const selectedLabel = computed(() => {
  const found = props.options.find(opt => opt.value === props.modelValue)
  return found ? found.label : ''
})

const toggleDropdown = () => {
  if (props.disabled) return
  open.value = !open.value
}

const selectOption = (value: string) => {
  emit('update:modelValue', value)
  open.value = false
}

const handleClickOutside = (event: MouseEvent) => {
  if (selectRef.value && !selectRef.value.contains(event.target as Node)) {
    open.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped>
.custom-select {
  position: relative;
  width: 100%;
  min-width: 160px;
  user-select: none;
}

.select-trigger {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #2f2f2f;
  border: 1px solid #3f3f3f;
  border-radius: 8px;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 13px;
  color: #fff;
  transition: all 0.2s;
}

.select-trigger:hover {
  border-color: #10a37f;
}

.selected-value {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: calc(100% - 24px);
}

.arrow {
  transition: transform 0.2s;
  font-size: 10px;
  margin-left: 8px;
  color: #aaa;
}

.arrow.rotated {
  transform: rotate(180deg);
}

.dropdown-list {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: #2f2f2f;
  border: 1px solid #3f3f3f;
  border-radius: 8px;
  margin-top: 4px;
  padding: 0;
  list-style: none;
  z-index: 100;
  max-height: 250px;
  overflow-y: auto;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}

.dropdown-list li {
  padding: 8px 12px;
  cursor: pointer;
  font-size: 13px;
  color: #fff;
  white-space: normal;
  word-break: break-word;
}

.dropdown-list li:hover {
  background: #10a37f;
}

.dropdown-list li.active {
  background: #10a37f;
  font-weight: 500;
}

.custom-select.disabled .select-trigger {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>