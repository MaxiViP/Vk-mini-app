import prisma from '../../db/prisma.js'

const AI_MEMORY_MAX_LENGTH = 1200
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
	if (error.code === 'P2021' || error.code === 'P2022' || error.code === 'P1001') return true
	const message = String(error.message || '').toLowerCase()
	return (
		(message.includes('user_workspaces') && (message.includes('does not exist') || message.includes("doesn't exist"))) ||
		message.includes("can't reach database server") ||
		message.includes('connection refused') ||
		message.includes('econnrefused') ||
		message.includes('prisma client is not initialized')
	)
}

const toMessage = item => ({
	role: item.role,
	content: item.content,
	timestamp: Number(item.timestamp) || Date.now(),
})

const normalizeAiMemory = value => String(value || '').slice(0, AI_MEMORY_MAX_LENGTH).trim()

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
	const aiMemory = normalizeAiMemory(payload.aiMemory)

	return {
		notes,
		folders: hasInbox ? folders : [{ id: 'inbox', name: 'Входящие' }, ...folders],
		...(aiMemory ? { aiMemory } : {}),
	}
}

const mergeNotesPayload = (currentPayload, patch = {}) => {
	const current = sanitizeNotesPayload(currentPayload)
	const next = patch && typeof patch === 'object' ? patch : {}
	const nextNotes = Array.isArray(next.notes) ? sanitizeNotesPayload({ notes: next.notes, folders: current.folders }).notes : current.notes
	const nextFolders = Array.isArray(next.folders)
		? sanitizeNotesPayload({ notes: current.notes, folders: next.folders }).folders
		: current.folders
	const aiMemory =
		Object.prototype.hasOwnProperty.call(next, 'aiMemory') ? normalizeAiMemory(next.aiMemory) : normalizeAiMemory(current.aiMemory)

	return {
		notes: nextNotes,
		folders: nextFolders,
		...(aiMemory ? { aiMemory } : {}),
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

const getOrCreateWorkspaceRecord = async userId => {
	if (!prisma.userWorkspace) return null

	try {
		return await upsertDefaultWorkspace(userId)
	} catch (error) {
		if (isWorkspaceStorageUnavailable(error)) {
			return null
		}
		throw error
	}
}

const buildWorkspaceFallback = payload => ({
	...payload,
	updatedAt: new Date(),
})

const persistWorkspace = async (userId, update) => {
	if (!prisma.userWorkspace) {
		return buildWorkspaceFallback(update)
	}

	try {
		return await prisma.userWorkspace.upsert({
			where: { userId },
			update,
			create: {
				userId,
				chatHistory: update.chatHistory ?? [],
				notesPayload: update.notesPayload ?? DEFAULT_NOTES_PAYLOAD,
			},
		})
	} catch (error) {
		if (isWorkspaceStorageUnavailable(error)) {
			return buildWorkspaceFallback(update)
		}
		throw error
	}
}

export const workspaceService = {
	async getWorkspace(userId) {
		if (!prisma.userWorkspace) return getDefaultWorkspacePayload()

		const workspace = await getOrCreateWorkspaceRecord(userId)
		if (!workspace) return getDefaultWorkspacePayload()

		return {
			chatHistory: sanitizeChatHistory(workspace.chatHistory),
			notesPayload: sanitizeNotesPayload(workspace.notesPayload),
			updatedAt: workspace.updatedAt,
		}
	},

	async saveChatHistory(userId, chatHistory) {
		const sanitized = sanitizeChatHistory(chatHistory)
		const workspace = await persistWorkspace(userId, { chatHistory: sanitized })

		return {
			chatHistory: sanitizeChatHistory(workspace.chatHistory),
			updatedAt: workspace.updatedAt,
		}
	},

	async saveNotesPayload(userId, notesPayload) {
		const currentWorkspace = await getOrCreateWorkspaceRecord(userId)
		const mergedNotesPayload = mergeNotesPayload(currentWorkspace?.notesPayload, sanitizeNotesPayload(notesPayload))
		const workspace = await persistWorkspace(userId, { notesPayload: mergedNotesPayload })

		return {
			notesPayload: sanitizeNotesPayload(workspace.notesPayload),
			updatedAt: workspace.updatedAt,
		}
	},

	async getAiMemory(userId) {
		const workspace = await getOrCreateWorkspaceRecord(userId)

		return {
			aiMemory: normalizeAiMemory(workspace?.notesPayload?.aiMemory),
			updatedAt: workspace?.updatedAt || new Date(),
		}
	},

	async saveAiMemory(userId, aiMemory) {
		const currentWorkspace = await getOrCreateWorkspaceRecord(userId)
		const mergedNotesPayload = mergeNotesPayload(currentWorkspace?.notesPayload, { aiMemory })
		const workspace = await persistWorkspace(userId, { notesPayload: mergedNotesPayload })

		return {
			aiMemory: normalizeAiMemory(workspace?.notesPayload?.aiMemory),
			updatedAt: workspace.updatedAt,
		}
	},
}
