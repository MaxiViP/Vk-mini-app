export const normalizeChatMode = value => (value === 'ai' ? 'ai' : 'core')

export const shouldUseAiApi = chatMode => normalizeChatMode(chatMode) === 'ai'

export const getChatHistorySource = chatMode => (shouldUseAiApi(chatMode) ? 'backend-db' : 'workspace')
