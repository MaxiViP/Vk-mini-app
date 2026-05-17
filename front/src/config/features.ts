export const FEATURES = {
	homePage: true,
	promptCatalog: true,
	aiTools: true,
	assistants: true,
	bonuses: true,
	referrals: true,
	publicCollections: true,
	changelog: true,
	safetyPage: true,
	helpPage: true,
	tariffsPage: true,
	feedbackPage: true,
	sharing: true,
	dailyTasks: true,
	promptFavorites: true,
	customAssistants: true,
} as const

export type FeatureName = keyof typeof FEATURES
