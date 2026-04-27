export const normalizeChatMode = value => (value === 'ai' ? 'ai' : 'core')

export const shouldUseAiApi = chatMode => normalizeChatMode(chatMode) === 'ai'

export const getChatHistorySource = chatMode => (shouldUseAiApi(chatMode) ? 'external-ai' : 'workspace')

export const normalizeVkAiSessionContext = value => String(value || '').trim()

export const resolveVkAiRequestMode = ({ mode, sessionContext } = {}) => {
	const hasSessionContext = Boolean(normalizeVkAiSessionContext(sessionContext))
	if (hasSessionContext) return 'context'
	return mode === 'context' ? 'context' : 'simple'
}
