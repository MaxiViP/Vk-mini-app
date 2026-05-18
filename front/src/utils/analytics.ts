export type AnalyticsParams = Record<string, string | number | boolean | null | undefined>

export type AnalyticsEventName =
	| 'home_opened'
	| 'chat_opened'
	| 'prompt_catalog_opened'
	| 'prompt_used'
	| 'tool_used'
	| 'assistant_selected'
	| 'tariffs_opened'
	| 'bonus_opened'
	| 'referral_shared'
	| 'answer_copied'
	| 'answer_saved'
	| 'answer_shared'
	| 'feedback_sent'
	| 'changelog_opened'
	| 'help_opened'
	| 'safety_opened'

export function trackEvent(name: AnalyticsEventName, params?: AnalyticsParams) {
	console.log('[analytics]', name, params ?? {})
}
