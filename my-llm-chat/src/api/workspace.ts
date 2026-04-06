const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

export interface WorkspaceMessage {
	role: 'user' | 'assistant'
	content: string
	timestamp: number
}

export interface WorkspaceFolder {
	id: string
	name: string
}

export interface WorkspaceNote {
	text: string
	date: number
	folderId: string
}

export interface NotesPayload {
	notes: WorkspaceNote[]
	folders: WorkspaceFolder[]
}

export interface WorkspaceResponse {
	chatHistory: WorkspaceMessage[]
	notesPayload: NotesPayload
	updatedAt: string
}

const authHeaders = (token: string) => ({
	'Content-Type': 'application/json',
	Authorization: `Bearer ${token}`,
})

export async function fetchWorkspace(token: string): Promise<WorkspaceResponse> {
	const response = await fetch(`${API_BASE_URL}/api/workspace/me`, {
		headers: { Authorization: `Bearer ${token}` },
	})
	if (!response.ok) throw new Error(`Workspace fetch failed: HTTP ${response.status}`)
	return response.json()
}

export async function saveChatHistory(token: string, chatHistory: WorkspaceMessage[]) {
	const response = await fetch(`${API_BASE_URL}/api/workspace/me/chat-history`, {
		method: 'PUT',
		headers: authHeaders(token),
		body: JSON.stringify({ chatHistory }),
	})
	if (!response.ok) throw new Error(`Chat history save failed: HTTP ${response.status}`)
	return response.json()
}

export async function saveNotesPayload(token: string, notesPayload: NotesPayload) {
	const response = await fetch(`${API_BASE_URL}/api/workspace/me/notes`, {
		method: 'PUT',
		headers: authHeaders(token),
		body: JSON.stringify({ notesPayload }),
	})
	if (!response.ok) throw new Error(`Notes save failed: HTTP ${response.status}`)
	return response.json()
}
