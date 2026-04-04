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
import { computed, onMounted, onUnmounted, ref } from 'vue'

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
	const found = props.options.find((opt) => opt.value === props.modelValue)
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