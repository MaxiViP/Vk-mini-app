<template>
	<div class="ai-logo">
		<svg viewBox="0 0 180 120" xmlns="http://www.w3.org/2000/svg" aria-label="AI logo">
			<defs>
				<linearGradient id="aiGradient" x1="0%" y1="0%" x2="100%" y2="100%">
					<stop offset="0%" stop-color="#f6e05e" />
					<stop offset="50%" stop-color="#f6ad55" />
					<stop offset="100%" stop-color="#f687b3" />
				</linearGradient>
			</defs>

			<!-- A -->
			<path
				class="ai-path ai-a"
				d="M20 100 L55 20 L90 100 M35 68 L75 68"
				fill="none"
				stroke="url(#aiGradient)"
				stroke-width="8"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>

			<!-- I -->
			<path
				class="ai-path ai-i"
				d="M120 25 L160 25 M140 25 L140 100 M120 100 L160 100"
				fill="none"
				stroke="url(#aiGradient)"
				stroke-width="8"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
	</div>
</template>

<style scoped>
.ai-logo {
	display: flex;
	justify-content: center;
	align-items: center;
}

.ai-logo svg {
	width: 140px;
	height: 40px;
	display: block;
	overflow: visible;
}

.ai-path {
	stroke-dasharray: 220;
	stroke-dashoffset: 220;
	animation: drawAI 4.2s ease-in-out infinite alternate;
	filter: drop-shadow(0 0 6px rgba(246, 173, 85, 0.35));
}

.ai-i {
	animation-delay: 0.25s;
}

@keyframes drawAI {
	0% {
		stroke-dashoffset: 220;
		opacity: 0.6;
	}
	60% {
		opacity: 1;
	}
	100% {
		stroke-dashoffset: 0;
		opacity: 1;
	}
}
</style>