<template>
	<div class="ai-logo">
		<svg viewBox="0 0 720 120" xmlns="http://www.w3.org/2000/svg" aria-label="НЕЙРОЧАТS logo">
			<defs>
				<linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="0%">
					<stop offset="0%" stop-color="#fff6cc" />
					<stop offset="22%" stop-color="#f7d774" />
					<stop offset="42%" stop-color="#c9972e" />
					<stop offset="50%" stop-color="#ffffff" />
					<stop offset="58%" stop-color="#e6b94c" />
					<stop offset="78%" stop-color="#b9821f" />
					<stop offset="100%" stop-color="#fff1a8" />

					<animateTransform
						attributeName="gradientTransform"
						type="translate"
						from="-1 0"
						to="1 0"
						dur="3.2s"
						repeatCount="indefinite"
					/>
				</linearGradient>

				<linearGradient id="silverGradient" x1="0%" y1="0%" x2="100%" y2="0%">
					<stop offset="0%" stop-color="#ffffff" />
					<stop offset="24%" stop-color="#dfe3e6" />
					<stop offset="44%" stop-color="#aeb4ba" />
					<stop offset="50%" stop-color="#ffffff" />
					<stop offset="58%" stop-color="#c8cdd2" />
					<stop offset="78%" stop-color="#f4f6f8" />
					<stop offset="100%" stop-color="#bfc3c7" />

					<animateTransform
						attributeName="gradientTransform"
						type="translate"
						from="1 0"
						to="-1 0"
						dur="4s"
						repeatCount="indefinite"
					/>
				</linearGradient>
			</defs>

			<text
				x="50%"
				y="50%"
				text-anchor="middle"
				dominant-baseline="middle"
				class="logo-text logo-text--outer"
			>
				НЕЙРОЧАТS
			</text>

			<text
				x="50%"
				y="50%"
				text-anchor="middle"
				dominant-baseline="middle"
				class="logo-text logo-text--inner"
			>
				НЕЙРОЧАТS
			</text>
		</svg>
	</div>
</template>

<style scoped>
.ai-logo {
	display: flex;
	justify-content: center;
	align-items: center;
	background: radial-gradient(
		circle at center,
		rgba(255, 215, 120, 0.1),
		rgba(255, 255, 255, 0.03) 38%,
		transparent 72%
	);
}

.ai-logo svg {
	height: 44px;
	display: block;
	overflow: visible;
	margin-top: 5px;
}

.logo-text {
	fill: none;
	stroke-linecap: round;
	stroke-linejoin: round;
	font-family: 'Arial Narrow', 'Roboto Condensed', 'Helvetica Neue', Arial, sans-serif;
	font-size: 90px;
	font-weight: 200;
	letter-spacing: 7px;

	transform: scaleX(1.08);
	transform-origin: center;

	stroke-dasharray: 900;
	stroke-dashoffset: 900;
	animation: drawLogo 2.2s ease-in-out infinite alternate;
}

.logo-text--outer {
	stroke: url(#goldGradient);
	stroke-width: 3.5;
	filter:
		drop-shadow(0 0 4px rgba(255, 215, 120, 0.45))
		drop-shadow(0 0 10px rgba(201, 151, 46, 0.35))
		drop-shadow(0 0 18px rgba(185, 130, 31, 0.18));
}

.logo-text--inner {
	stroke: url(#silverGradient);
	stroke-width: 1.2;
	opacity: 0.92;
	animation-delay: 0.35s;
	filter:
		drop-shadow(0 0 3px rgba(255, 255, 255, 0.65))
		drop-shadow(0 0 7px rgba(200, 205, 210, 0.42));
}

.ai-logo:hover .logo-text--outer {
	filter:
		drop-shadow(0 0 6px rgba(255, 215, 120, 0.7))
		drop-shadow(0 0 14px rgba(201, 151, 46, 0.55))
		drop-shadow(0 0 24px rgba(185, 130, 31, 0.3));
}

.ai-logo:hover .logo-text--inner {
	opacity: 1;
	filter:
		drop-shadow(0 0 5px rgba(255, 255, 255, 0.85))
		drop-shadow(0 0 10px rgba(220, 225, 230, 0.55));
}

@keyframes drawLogo {
	0% {
		stroke-dashoffset: 900;
		opacity: 0.55;
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
	}
}
</style>