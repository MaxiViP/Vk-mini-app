<template>
	<div class="ai-logo">
		<svg viewBox="0 0 720 120" xmlns="http://www.w3.org/2000/svg" aria-label="НЕЙРОЧАТS logo">
			<defs>
				<linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
					<stop offset="0%" stop-color="#f6e05e" />
					<stop offset="50%" stop-color="#f6ad55" />
					<stop offset="100%" stop-color="#f687b3" />
				</linearGradient>
			</defs>

			<text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" class="logo-text">НЕЙРОЧАТS</text>
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
	/* width: 320px; */
	height: 44px;
	display: block;
	overflow: visible;
	margin-top: 5px;
}

.logo-text {
	fill: none;
	stroke: url(#logoGradient);
	stroke-width: 1.6;
	stroke-linecap: round;
	stroke-linejoin: round;
	font-family: 'Arial Narrow', 'Roboto Condensed', 'Helvetica Neue', Arial, sans-serif;
	font-size: 90px;
	font-weight: 200;
	letter-spacing: 6px;

	transform: scaleX(1.08);
	transform-origin: center;

	stroke-dasharray: 900;
	stroke-dashoffset: 900;
	animation: drawLogo 2.2s ease-in-out infinite alternate;

	filter: drop-shadow(0 0 6px rgba(246, 173, 85, 0.35));
}

@keyframes drawLogo {
	0% {
		stroke-dashoffset: 900;
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

@media (max-width: 420px) {
	.ai-logo svg {
		width: 240px;
		height: 44px;
		display: block;
		overflow: visible;
		margin-top: 5px;
	}
}
</style>
