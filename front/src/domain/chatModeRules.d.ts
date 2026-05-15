export function normalizeVkAiSessionContext(value: unknown): string

export function resolveVkAiRequestMode(options?: {
	mode?: 'context' | 'simple' | string
	sessionContext?: string
}): 'context' | 'simple'

export function shouldUseAiApi(mode?: string): boolean
