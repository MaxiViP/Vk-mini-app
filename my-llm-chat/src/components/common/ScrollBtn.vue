<template>
	<button
		class="scroll-btn"
		:class="type"
		@click="handleScroll"
		type="button"
		:aria-label="type === 'bottom' ? 'Прокрутить вниз' : 'Прокрутить вверх'"
	>
		{{ type === 'bottom' ? '↓' : '↑' }}
	</button>
</template>

<script setup lang="ts">
const props = withDefaults(
	defineProps<{
		type?: 'top' | 'bottom'
		target?: string
	}>(),
	{
		type: 'top',
		target: '',
	},
)

const getTargetElement = (): HTMLElement | null => {
	if (!props.target) return null
	return document.querySelector(props.target) as HTMLElement | null
}

const handleScroll = () => {
	const el = getTargetElement()

	console.log('type:', props.type)
	console.log('target:', props.target)
	console.log('element:', el)

	if (el) {
		console.log('scrollHeight:', el.scrollHeight)
		console.log('clientHeight:', el.clientHeight)

		el.scrollTo({
			top: props.type === 'bottom' ? el.scrollHeight : 0,
			behavior: 'smooth',
		})
		return
	}

	const pageHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)

	window.scrollTo({
		top: props.type === 'bottom' ? pageHeight : 0,
		behavior: 'smooth',
	})
}
</script>

<style scoped>
.scroll-btn {
	position: absolute;
	top: 0;
	left: 50%;
	transform: translate(-50%, -50%);
	width: 40px;
	height: 40px;
	border: 1px solid var(--color-border-soft);
	border-radius: 50%;
	background: var(--color-surface);
	color: var(--color-text);
	font-size: 18px;
	font-weight: 700;
	cursor: pointer;
	display: flex;
	align-items: center;
	justify-content: center;
	box-shadow: 0 6px 18px rgba(0, 0, 0, 0.22);
	z-index: 2;
	transition: all var(--transition-fast);
}

.scroll-btn:hover {
	transform: translate(-50%, -50%) translateY(-2px);
	background: var(--overlay-light);
	border-color: var(--color-primary);
}

.scroll-btn:hover {
	background: var(--overlay-light);
	border-color: var(--color-primary);
}

.scroll-btn.up {
	transform: translate(-50%, -50%);
}

.scroll-btn.up:hover {
	transform: translate(-50%, -50%) translateY(-2px);
}

.scroll-btn.down {
	transform: rotate(180deg);
}

.scroll-btn.down:hover {
	transform: rotate(180deg) translateY(2px);
}

.scroll-btn.static {
	position: static;
}
</style>
