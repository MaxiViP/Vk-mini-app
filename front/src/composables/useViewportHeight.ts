export const useViewportHeight = () => {
	const syncViewportHeight = () => {
		document.documentElement.style.setProperty('--viewport-height', `${window.innerHeight}px`)
	}

	const startViewportSync = () => {
		syncViewportHeight()
		window.addEventListener('resize', syncViewportHeight)
		window.addEventListener('orientationchange', syncViewportHeight)
	}

	const stopViewportSync = () => {
		window.removeEventListener('resize', syncViewportHeight)
		window.removeEventListener('orientationchange', syncViewportHeight)
	}

	return {
		startViewportSync,
		stopViewportSync,
	}
}
