<template>
	<button
		class="scroll-btn"
		@click="handleScroll"
		type="button"
		:aria-label="isAtBottom ? 'Прокрутить вверх' : 'Прокрутить вниз'"
	>
		{{ arrow }}
	</button>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'

const props = withDefaults(
	defineProps<{
		target?: string
	}>(),
	{
		target: '',
	},
)

const isAtBottom = ref(false)

const getTargetElement = (): HTMLElement | null => {
	if (!props.target) return null
	return document.querySelector(props.target) as HTMLElement | null
}

const checkScrollPosition = () => {
	const el = getTargetElement()

	if (el) {
		const threshold = 10
		isAtBottom.value =
			el.scrollTop + el.clientHeight >= el.scrollHeight - threshold
		return
	}

	const scrollTop = window.scrollY
	const windowHeight = window.innerHeight
	const pageHeight = document.documentElement.scrollHeight

	isAtBottom.value =
		scrollTop + windowHeight >= pageHeight - 10
}

const handleScroll = () => {
	const el = getTargetElement()

	if (el) {
		el.scrollTo({
			top: isAtBottom.value ? 0 : el.scrollHeight,
			behavior: 'smooth',
		})
		return
	}

	const pageHeight = document.documentElement.scrollHeight

	window.scrollTo({
		top: isAtBottom.value ? 0 : pageHeight,
		behavior: 'smooth',
	})
}

onMounted(() => {
	const el = getTargetElement()
	if (el) {
		el.addEventListener('scroll', checkScrollPosition)
	} else {
		window.addEventListener('scroll', checkScrollPosition)
	}

	checkScrollPosition()
})

onUnmounted(() => {
	const el = getTargetElement()
	if (el) {
		el.removeEventListener('scroll', checkScrollPosition)
	} else {
		window.removeEventListener('scroll', checkScrollPosition)
	}
})

const arrow = computed(() => (isAtBottom.value ? '↑' : '↓'))
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

.scroll-btn.top {
	transform: translate(-50%, -50%);
}

.scroll-btn.top:hover {
	transform: translate(-50%, -50%) translateY(-2px);
}

.scroll-btn.bottom {
	transform: translate(-50%, -50%);
}

.scroll-btn.bottom:hover {
	transform: translate(-50%, -50%) translateY(-2px);
}

.scroll-btn.static {
	position: static;
}
</style>
