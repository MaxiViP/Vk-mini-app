export type UiTheme = 'light' | 'dark'

export const UI_THEME_STORAGE_KEY = 'vk-mini-app-ui-theme'
export const DEFAULT_UI_THEME: UiTheme = 'dark'

export const normalizeUiTheme = (value: string | null): UiTheme => (value === 'light' ? 'light' : DEFAULT_UI_THEME)

export const readStoredUiTheme = (): UiTheme => {
	try {
		return normalizeUiTheme(localStorage.getItem(UI_THEME_STORAGE_KEY))
	} catch {
		return DEFAULT_UI_THEME
	}
}

export const applyUiTheme = (theme: UiTheme) => {
	document.documentElement.dataset.uiTheme = normalizeUiTheme(theme)
}

export const persistUiTheme = (theme: UiTheme) => {
	const normalizedTheme = normalizeUiTheme(theme)
	applyUiTheme(normalizedTheme)

	try {
		localStorage.setItem(UI_THEME_STORAGE_KEY, normalizedTheme)
	} catch {
		// Theme should still apply when storage is unavailable.
	}
}
