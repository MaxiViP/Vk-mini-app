export const DEFAULT_VIEW_PANELS = {
	HOME: 'home',
	CHAT: 'chat',
	PROMPTS: 'prompts',
	TOOLS: 'tools',
	ASSISTANTS: 'assistants',
	TARIFFS: 'tariffs',
	BONUSES: 'bonuses',
	HELP: 'help',
	SAFETY: 'safety',
	CHANGELOG: 'changelog',
	FEEDBACK: 'feedback',
} as const

export type PanelId = (typeof DEFAULT_VIEW_PANELS)[keyof typeof DEFAULT_VIEW_PANELS]
