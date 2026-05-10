<template>
	<button
		:class="['scroll-btn', { 'scroll-btn--up': isAtBottom, 'scroll-btn--down': !isAtBottom }]"
		@click="handleScroll"
		type="button"
		:aria-label="isAtBottom ? 'Прокрутить вверх' : 'Прокрутить вниз'"
	>
		<span class="scroll-btn__glow" aria-hidden="true"></span>

		<svg class="scroll-btn__icon" viewBox="0 0 24 24" aria-hidden="true">
			<path class="scroll-btn__line" d="M12 5v14" />
			<path class="scroll-btn__arrow" d="M6 13l6 6l6-6" />
		</svg>
	</button>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

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
		isAtBottom.value = el.scrollTop + el.clientHeight >= el.scrollHeight - threshold
		return
	}

	const scrollTop = window.scrollY
	const windowHeight = window.innerHeight
	const pageHeight = document.documentElement.scrollHeight

	isAtBottom.value = scrollTop + windowHeight >= pageHeight - 10
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

	window.scrollTo({
		top: isAtBottom.value ? 0 : document.documentElement.scrollHeight,
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
</script>

<style scoped>
.scroll-btn {
	position: absolute;
	top: 0;
	left: 50%;
	transform: translate(-50%, -50%);
	isolation: isolate;
	overflow: hidden;

	width: 44px;
	height: 44px;
	border: 1px solid var(--mode-accent-border, rgba(255, 255, 255, 0.14));
	border-radius: 15px;
	background: linear-gradient(135deg, rgba(255, 255, 255, 0.1), transparent 52%), rgba(21, 24, 31, 0.96);
	color: var(--mode-accent-strong, #fff);

	cursor: pointer;
	display: inline-grid;
	place-items: center;

	box-shadow:
		0 10px 24px rgba(0, 0, 0, 0.18),
		inset 0 1px 0 rgba(255, 255, 255, 0.08);

	z-index: 2;

	transition:
		transform var(--transition-fast),
		background var(--transition-base),
		border-color var(--transition-base),
		box-shadow var(--transition-base),
		color var(--transition-base),
		opacity var(--transition-base);
}

.scroll-btn::before {
	content: '';
	position: absolute;
	inset: -58%;
	z-index: -2;
	background: conic-gradient(
		from 180deg,
		transparent 0deg,
		var(--mode-accent-soft, rgba(36, 209, 180, 0.14)) 80deg,
		var(--mode-accent-border, rgba(36, 209, 180, 0.36)) 135deg,
		transparent 210deg,
		transparent 360deg
	);
	opacity: 0;
	transform: rotate(0deg) scale(0.74);
	transition:
		opacity var(--transition-base),
		transform var(--transition-base);
}

.scroll-btn::after {
	content: '';
	position: absolute;
	inset: 1px;
	z-index: -1;
	border-radius: inherit;
	background: linear-gradient(135deg, rgba(255, 255, 255, 0.1), transparent 52%), rgba(21, 24, 31, 0.96);
}

.scroll-btn:hover {
	transform: translate(-50%, -50%) translateY(-2px);
	border-color: var(--mode-accent-border, var(--color-primary));
	color: var(--mode-accent-strong, #fff);
	box-shadow:
		0 0 0 1px var(--mode-accent-soft, rgba(36, 209, 180, 0.14)),
		0 14px 34px rgba(0, 0, 0, 0.26),
		0 0 26px var(--mode-accent-soft, rgba(36, 209, 180, 0.14));
}

.scroll-btn:hover::before {
	opacity: 1;
	transform: rotate(90deg) scale(1);
	animation: scrollBtnAuraSpin 2.8s linear infinite;
}

.scroll-btn:active {
	transform: translate(-50%, -50%) scale(0.94);
}

.scroll-btn__glow {
	position: absolute;
	inset: 5px;
	z-index: 0;
	border-radius: 12px;
	background: radial-gradient(circle, var(--mode-accent-soft, rgba(36, 209, 180, 0.16)), transparent 68%);
	opacity: 0;
	transform: scale(0.82);
	transition:
		opacity var(--transition-base),
		transform var(--transition-base);
}

.scroll-btn:hover .scroll-btn__glow {
	opacity: 1;
	transform: scale(1);
}

.scroll-btn__icon {
	position: relative;
	z-index: 1;
	width: 21px;
	height: 21px;
	fill: none;
	stroke: currentColor;
	stroke-width: 2.35;
	stroke-linecap: round;
	stroke-linejoin: round;
	filter: drop-shadow(0 0 8px rgba(255, 255, 255, 0.05));
	transition:
		transform var(--transition-base),
		stroke-width var(--transition-fast),
		filter var(--transition-base);
}

.scroll-btn:hover .scroll-btn__icon {
	stroke-width: 2.55;
	filter: drop-shadow(0 0 10px var(--mode-accent-soft, rgba(36, 209, 180, 0.18)));
}

.scroll-btn--up .scroll-btn__icon {
	transform: rotate(180deg);
}

.scroll-btn--down .scroll-btn__icon {
	transform: rotate(0deg);
}

.scroll-btn--up:hover .scroll-btn__icon {
	transform: rotate(180deg) translateY(1px) scale(1.08);
}

.scroll-btn--down:hover .scroll-btn__icon {
	transform: translateY(1px) scale(1.08);
}

.scroll-btn__line {
	opacity: 0.48;
	stroke-dasharray: 14 18;
	stroke-dashoffset: 0;
	transition:
		opacity var(--transition-base),
		stroke-dashoffset var(--transition-base);
}

.scroll-btn:hover .scroll-btn__line {
	opacity: 1;
	stroke-dashoffset: -18;
}

.scroll-btn.static {
	position: static;
	transform: none;
}

.scroll-btn.static:hover {
	transform: translateY(-2px);
}

.scroll-btn.static:active {
	transform: scale(0.94);
}

@keyframes scrollBtnAuraSpin {
	to {
		transform: rotate(450deg) scale(1);
	}
}

@media (prefers-reduced-motion: reduce) {
	.scroll-btn,
	.scroll-btn::before,
	.scroll-btn__glow,
	.scroll-btn__icon,
	.scroll-btn__line {
		animation: none;
		transition: none;
	}

	.scroll-btn:hover,
	.scroll-btn:active,
	.scroll-btn.static:hover,
	.scroll-btn.static:active {
		transform: translate(-50%, -50%);
	}

	.scroll-btn.static:hover,
	.scroll-btn.static:active {
		transform: none;
	}
}
</style>
