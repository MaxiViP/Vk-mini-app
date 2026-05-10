<template>
	<span :class="['confirm-delete-chip', { 'confirm-delete-chip--pending': isPending }]" :title="title">
		<span class="confirm-delete-chip__label">{{ label }}</span>

		<button
			type="button"
			:class="['confirm-delete-chip__delete', { 'confirm-delete-chip__delete--pending': isPending }]"
			:title="isPending ? 'Нажмите, чтобы отменить удаление' : 'Удалить файл из контекста'"
			:aria-label="isPending ? `Отменить удаление ${label}` : `Удалить файл из контекста ${label}`"
			@click.stop="handleDeleteClick"
		>
			{{ isPending ? countdown : '×' }}
		</button>
	</span>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

const DELETE_COUNTDOWN_SECONDS = 3

const props = withDefaults(
	defineProps<{
		label: string
		title?: string
	}>(),
	{
		title: '',
	},
)

const emit = defineEmits<{
	(e: 'delete'): void
}>()

const countdown = ref(0)
let timer: number | null = null

const isPending = computed(() => countdown.value > 0)

const clearDeleteTimer = () => {
	if (timer === null) return

	window.clearInterval(timer)
	timer = null
}

const cancelDeleteCountdown = () => {
	clearDeleteTimer()
	countdown.value = 0
}

const finishDeleteCountdown = () => {
	cancelDeleteCountdown()
	emit('delete')
}

const startDeleteCountdown = () => {
	if (isPending.value) {
		cancelDeleteCountdown()
		return
	}

	countdown.value = DELETE_COUNTDOWN_SECONDS
	timer = window.setInterval(() => {
		const nextCountdown = countdown.value - 1

		if (nextCountdown <= 0) {
			finishDeleteCountdown()
			return
		}

		countdown.value = nextCountdown
	}, 1000)
}

const handleDeleteClick = () => {
	if (isPending.value) {
		cancelDeleteCountdown()
		return
	}

	startDeleteCountdown()
}

watch(() => props.label, cancelDeleteCountdown)
onBeforeUnmount(cancelDeleteCountdown)
</script>
