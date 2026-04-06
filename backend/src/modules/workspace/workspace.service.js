import prisma from '../../db/prisma.js'

const DEFAULT_NOTES_PAYLOAD = {
	notes: [],
	folders: [{ id: 'inbox', name: 'Входящие' }],
}

const getDefaultWorkspacePayload = () => ({
	chatHistory: [],
	notesPayload: DEFAULT_NOTES_PAYLOAD,
	updatedAt: new Date(),
})

const isWorkspaceStorageUnavailable = error => {
	if (!error) return false
	if (error.code === 'P2021') return true
	const message = String(error.message || '').toLowerCase()
	return (
		message.includes('user_workspaces') && (message.includes('does not exist') || message.includes("doesn't exist"))
	)
}

const toMessage = item => ({
	role: item.role,
	content: item.content,
	timestamp: Number(item.timestamp) || Date.now(),
})

const sanitizeChatHistory = payload => {
	if (!Array.isArray(payload)) return []
	return payload
		.filter(item => item && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string')
		.map(toMessage)
}

const sanitizeNotesPayload = payload => {
	if (!payload || typeof payload !== 'object') {
		return DEFAULT_NOTES_PAYLOAD
	}

	const notes = Array.isArray(payload.notes)
		? payload.notes
				.filter(note => note && typeof note.text === 'string')
				.map(note => ({
					text: note.text,
					date: Number(note.date) || Date.now(),
					folderId: typeof note.folderId === 'string' && note.folderId ? note.folderId : 'inbox',
				}))
		: []

	const folders = Array.isArray(payload.folders)
		? payload.folders
				.filter(folder => folder && typeof folder.id === 'string' && typeof folder.name === 'string')
				.map(folder => ({ id: folder.id, name: folder.name }))
		: []

	const hasInbox = folders.some(folder => folder.id === 'inbox')
	return {
		notes,
		folders: hasInbox ? folders : [{ id: 'inbox', name: 'Входящие' }, ...folders],
	}
}

const upsertDefaultWorkspace = userId => {
	if (!prisma.userWorkspace) return Promise.resolve(null)
	return prisma.userWorkspace.upsert({
		where: { userId },
		update: {},
		create: {
			userId,
			chatHistory: [],
			notesPayload: DEFAULT_NOTES_PAYLOAD,
		},
	})
}

export const workspaceService = {
	async getWorkspace(userId) {
		if (!prisma.userWorkspace) return getDefaultWorkspacePayload()

		let workspace
		try {
			workspace = await upsertDefaultWorkspace(userId)
		} catch (error) {
			if (isWorkspaceStorageUnavailable(error)) {
				return getDefaultWorkspacePayload()
			}
			throw error
		}

		if (!workspace) return getDefaultWorkspacePayload()
		return {
			chatHistory: sanitizeChatHistory(workspace.chatHistory),
			notesPayload: sanitizeNotesPayload(workspace.notesPayload),
			updatedAt: workspace.updatedAt,
		}
	},

	async saveChatHistory(userId, chatHistory) {
		const sanitized = sanitizeChatHistory(chatHistory)
		if (!prisma.userWorkspace) {
			return { chatHistory: sanitized, updatedAt: new Date() }
		}

		let workspace
		try {
			workspace = await prisma.userWorkspace.upsert({
				where: { userId },
				update: { chatHistory: sanitized },
				create: {
					userId,
					chatHistory: sanitized,
					notesPayload: DEFAULT_NOTES_PAYLOAD,
				},
			})
		} catch (error) {
			if (isWorkspaceStorageUnavailable(error)) {
				return { chatHistory: sanitized, updatedAt: new Date() }
			}
			throw error
		}

		return {
			chatHistory: sanitizeChatHistory(workspace.chatHistory),
			updatedAt: workspace.updatedAt,
		}
	},

	async saveNotesPayload(userId, notesPayload) {
		const sanitized = sanitizeNotesPayload(notesPayload)
		if (!prisma.userWorkspace) {
			return { notesPayload: sanitized, updatedAt: new Date() }
		}

		let workspace
		try {
			workspace = await prisma.userWorkspace.upsert({
				where: { userId },
				update: { notesPayload: sanitized },
				create: {
					userId,
					chatHistory: [],
					notesPayload: sanitized,
				},
			})
		} catch (error) {
			if (isWorkspaceStorageUnavailable(error)) {
				return { notesPayload: sanitized, updatedAt: new Date() }
			}
			throw error
		}

		return {
			notesPayload: sanitizeNotesPayload(workspace.notesPayload),
			updatedAt: workspace.updatedAt,
		}
	},
}
