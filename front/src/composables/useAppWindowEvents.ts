export type SaveToNotesEvent = CustomEvent<{ text: string }>
export type ChatContextStateEvent = CustomEvent<{ open?: boolean }>

export const useAppWindowEvents = (options: {
	onSaveToNotes: (detail: SaveToNotesEvent['detail']) => void
	onChatContextState: (detail: ChatContextStateEvent['detail']) => void
}) => {
	const handleSaveToNotes: EventListener = event => {
		options.onSaveToNotes((event as SaveToNotesEvent).detail)
	}

	const handleChatContextState: EventListener = event => {
		options.onChatContextState((event as ChatContextStateEvent).detail)
	}

	const startAppWindowEvents = () => {
		window.addEventListener('save-to-notes', handleSaveToNotes)
		window.addEventListener('chat-context-state', handleChatContextState)
	}

	const stopAppWindowEvents = () => {
		window.removeEventListener('save-to-notes', handleSaveToNotes)
		window.removeEventListener('chat-context-state', handleChatContextState)
	}

	return {
		startAppWindowEvents,
		stopAppWindowEvents,
	}
}
