<template>
	<div class="input">
		<ScrollBtn type="top" />
		<div class="input-inner">
			<input v-model="text" @keydown.enter.prevent="submit" placeholder="Напишите сообщение..." :disabled="disabled" />
			<button class="send-btn" @click="submit" :disabled="disabled || !text.trim()" type="button">➤</button>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import ScrollBtn from '../common/ScrollBtn.vue'

const props = defineProps<{
	disabled?: boolean
}>()

const emit = defineEmits<{
	(e: 'send', message: string): void
}>()

const text = ref('')

const submit = () => {
	if (!text.value.trim() || props.disabled) return
	emit('send', text.value)
	text.value = ''
}
</script>

<style scoped>
.input {
	position: relative;
	padding-top: 22px;
}

.input-inner {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 10px 12px;
	background: var(--color-surface);
	border: 1px solid var(--color-border-soft);
	border-radius: 999px;
}

.input-inner input {
	flex: 1;
	border: none;
	outline: none;
	background: transparent;
	color: var(--color-text);
	font-size: 15px;
}

.input-inner input::placeholder {
	color: var(--color-text-muted);
}

.send-btn {
	width: 38px;
	height: 38px;
	border: none;
	border-radius: 50%;
	background: var(--color-primary);
	color: #fff;
	cursor: pointer;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 16px;
	transition:
		transform var(--transition-fast),
		background var(--transition-base),
		opacity var(--transition-base);
}

.send-btn:hover:not(:disabled) {
	transform: translateY(-1px);
	background: var(--color-primary-hover);
}

.send-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}
</style>
