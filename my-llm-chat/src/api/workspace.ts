const API_BASE_URL = ''

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

async function requestWorkspace<TResponse>(path: string, token: string, init?: RequestInit): Promise<TResponse> {
	const response = await fetch(`${API_BASE_URL}${path}`, {
		...init,
		headers: {
			...(init?.body ? authHeaders(token) : { Authorization: `Bearer ${token}` }),
			...(init?.headers || {}),
		},
	})

	if (!response.ok) {
		throw new Error(`Workspace request failed: ${init?.method || 'GET'} ${path} returned HTTP ${response.status}`)
	}

	return response.json() as Promise<TResponse>
}

export async function fetchWorkspace(token: string): Promise<WorkspaceResponse> {
	return requestWorkspace<WorkspaceResponse>('/api/workspace/me', token)
}

export async function saveChatHistory(token: string, chatHistory: WorkspaceMessage[]) {
	return requestWorkspace<{ chatHistory: WorkspaceMessage[]; updatedAt: string }>('/api/workspace/me/chat-history', token, {
		method: 'PUT',
		body: JSON.stringify({ chatHistory }),
	})
}

export async function saveNotesPayload(token: string, notesPayload: NotesPayload) {
	return requestWorkspace<{ notesPayload: NotesPayload; updatedAt: string }>('/api/workspace/me/notes', token, {
		method: 'PUT',
		body: JSON.stringify({ notesPayload }),
	})
}
