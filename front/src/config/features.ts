export const FEATURES = {
	homePage: true,
	promptCatalog: true,
	aiTools: true,
	assistants: false,
	bonuses: false,
	referrals: false,
	publicCollections: false,
	changelog: false,
	safetyPage: true,
	helpPage: true,
	tariffsPage: true,
	feedbackPage: true,
	sharing: false,
	dailyTasks: false,
	promptFavorites: false,
	customAssistants: false,
} as const

export type FeatureName = keyof typeof FEATURES
