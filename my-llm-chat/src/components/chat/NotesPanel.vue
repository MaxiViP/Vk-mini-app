<template>
	<Teleport to="body">
		<Transition name="slide">
			<div v-if="visible" class="notes-overlay" @click.self="close">
				<div class="notes-panel">
					<div class="notes-header">
						<h3>📝 Заметки</h3>
						<button class="close-btn" @click="close">✕</button>
					</div>

					<div class="notes-content">
						<div class="folder-controls">
							<div class="add-folder">
								<input v-model="newFolderName" type="text" placeholder="Новая папка..." @keyup.enter="addFolder" />
								<button @click="addFolder" :disabled="!newFolderName.trim()">📁 Создать</button>
							</div>
							<div class="folder-list">
								<button
									class="folder-chip"
									:class="{ active: activeFolderId === ALL_FOLDER_ID }"
									@click="activeFolderId = ALL_FOLDER_ID"
								>
									Все ({{ notes.length }})
								</button>
								<button
									v-for="folder in folders"
									:key="folder.id"
									class="folder-chip"
									:class="{ active: activeFolderId === folder.id }"
									@click="activeFolderId = folder.id"
								>
									<span>{{ folder.name }} ({{ notesCountByFolder(folder.id) }})</span>
									<span
										v-if="folder.id !== INBOX_FOLDER_ID"
										class="delete-folder"
										@click.stop="deleteFolder(folder.id)"
										title="Удалить папку"
									>
										✕
									</span>
								</button>
							</div>
						</div>

						<div class="add-note">
							<textarea v-model="newNoteText" placeholder="Вставьте текст заметки..." rows="3"></textarea>
							<div class="add-note-actions">
								<select v-model="selectedFolderId" class="folder-select">
									<option v-for="folder in folders" :key="folder.id" :value="folder.id">
										{{ folder.name }}
									</option>
								</select>
								<button @click="addNote" :disabled="!newNoteText.trim()">➕ Добавить</button>
							</div>
						</div>

						<div class="notes-list" v-if="displayedNotes.length > 0">
							<div v-for="note in displayedNotes" :key="`${note.date}-${note.index}`" class="note-item">
								<p>{{ note.text }}</p>
								<div class="note-actions">
									<span class="date">{{ formatDate(note.date) }}</span>
									<select
										:value="note.folderId"
										@change="moveNoteToFolder(note.index, ($event.target as HTMLSelectElement).value)"
									>
										<option v-for="folder in folders" :key="folder.id" :value="folder.id">
											{{ folder.name }}
										</option>
									</select>
									<button @click="copyNote(note.text)" title="Копировать">📋</button>
									<button @click="deleteNote(note.index)" title="Удалить">🗑️</button>
								</div>
							</div>
						</div>
						<div v-else class="empty-notes">
							<p>📭 В этой папке пока нет замеок.</p>
						</div>
					</div>

					<div class="notes-footer">
						<button @click="exportToTxt" class="export-btn">💾 Экспорт в TXT</button>
						<button @click="clearAllNotes" class="clear-btn" :disabled="notes.length === 0">🗑️ Очистить всё</button>
					</div>
				</div>
			</div>
		</Transition>
	</Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

import { fetchWorkspace, saveNotesPayload, type NotesPayload } from '../../api/workspace'
import { useUserStore } from '../../stores/user'

const INBOX_FOLDER_ID = 'inbox'
const ALL_FOLDER_ID = 'all'

interface Folder {
	id: string
	name: string
}

interface Note {
	text: string
	date: number
	folderId: string
}

defineProps<{ visible: boolean }>()
const emit = defineEmits<{ (e: 'update:visible', value: boolean): void }>()

const userStore = useUserStore()
const defaultFolders: Folder[] = [{ id: INBOX_FOLDER_ID, name: 'Входящие' }]
const notes = ref<Note[]>([])
const folders = ref<Folder[]>([...defaultFolders])
const newNoteText = ref('')
const newFolderName = ref('')
const selectedFolderId = ref(INBOX_FOLDER_ID)
const activeFolderId = ref<string>(ALL_FOLDER_ID)
let isHydrating = false
let lastSavedHash = ''
let saveInFlight: Promise<void> | null = null
let pendingSave = false

const isLikelyJwt = (token?: string | null) => Boolean(token && token.split('.').length === 3)

const mergeFoldersWithDefault = (savedFolders?: Folder[]) => {
	if (!Array.isArray(savedFolders) || savedFolders.length === 0) return [...defaultFolders]
	if (savedFolders.some(folder => folder.id === INBOX_FOLDER_ID)) return savedFolders
	return [...defaultFolders, ...savedFolders]
}

const applyNotesPayload = (payload?: Partial<NotesPayload>) => {
	notes.value = Array.isArray(payload?.notes)
		? payload!.notes.map(note => ({
				text: note.text,
				date: Number(note.date) || Date.now(),
				folderId: note.folderId || INBOX_FOLDER_ID,
			}))
		: []
	folders.value = mergeFoldersWithDefault(payload?.folders as Folder[] | undefined)
}

const payloadHash = (payload: NotesPayload) => JSON.stringify(payload)

const persistNotes = () => {
	if (isHydrating) {
		console.log('[notes] persistNotes:skipped_hydrating')
		return
	}

	const payload: NotesPayload = { notes: notes.value, folders: folders.value }

	if (!userStore.token || !isLikelyJwt(userStore.token) || !userStore.user?.vkId) {
		console.log('[notes] persistNotes:server_skipped', {
			hasToken: Boolean(userStore.token),
			isLikelyJwt: isLikelyJwt(userStore.token),
			userId: userStore.user?.vkId || null,
		})
		return
	}

	const currentHash = payloadHash(payload)
	if (currentHash === lastSavedHash) return
	pendingSave = true
	if (saveInFlight) return

	const flush = async () => {
		while (pendingSave) {
			pendingSave = false
			const latestPayload: NotesPayload = { notes: [...notes.value], folders: [...folders.value] }
			const latestHash = payloadHash(latestPayload)
			if (latestHash === lastSavedHash) continue

			try {
				console.log('[notes] persistNotes:server_save:start', { notes: latestPayload.notes.length })
				await saveNotesPayload(userStore.token!, latestPayload)
				lastSavedHash = latestHash
				console.log('[notes] persistNotes:server_save:success')
			} catch (error) {
				console.error('[notes] persistNotes:server_save:error', error)
			}
		}
	}

	saveInFlight = flush().finally(() => {
		saveInFlight = null
	})
}

const syncNotesWithServer = async () => {
	if (!userStore.token || !isLikelyJwt(userStore.token) || !userStore.user?.vkId) {
		console.log('[notes] syncNotesWithServer:skipped', {
			hasToken: Boolean(userStore.token),
			isLikelyJwt: isLikelyJwt(userStore.token),
			userId: userStore.user?.vkId || null,
		})
		return
	}

	console.log('[notes] syncNotesWithServer:start', { userId: userStore.user?.vkId })
	isHydrating = true
	try {
		const workspace = await fetchWorkspace(userStore.token)
		const serverPayload = workspace.notesPayload
		lastSavedHash = payloadHash(serverPayload)
		applyNotesPayload(serverPayload)
		console.log('[notes] syncNotesWithServer:success', { notes: notes.value.length, folders: folders.value.length })
	} catch (error) {
		console.warn('[notes] syncNotesWithServer:error', error)
		applyNotesPayload({ notes: [], folders: defaultFolders })
	} finally {
		isHydrating = false
	}
}

const setNewNoteText = (text: string) => {
	newNoteText.value = text
}

onMounted(async () => {
	await syncNotesWithServer()
})

watch([notes, folders], persistNotes, { deep: true })

watch(
	() => userStore.user?.vkId,
	async () => {
		await syncNotesWithServer()
	},
)

watch(
	() => userStore.token,
	async token => {
		if (token) await syncNotesWithServer()
	},
)

const displayedNotes = computed(() => {
	if (activeFolderId.value === ALL_FOLDER_ID) {
		return notes.value.map((note, index) => ({ ...note, index }))
	}

	return notes.value.map((note, index) => ({ ...note, index })).filter(note => note.folderId === activeFolderId.value)
})

const close = () => emit('update:visible', false)
const addFolder = () => {
	const name = newFolderName.value.trim()
	if (!name) return

	if (folders.value.some(folder => folder.name.toLowerCase() === name.toLowerCase())) {
		alert('Папка с таким именем уже существует')
		return
	}

	const id = `folder_${Date.now()}`
	folders.value.push({ id, name })
	newFolderName.value = ''
	selectedFolderId.value = id
	activeFolderId.value = id
}

const deleteFolder = (folderId: string) => {
	if (folderId === INBOX_FOLDER_ID) return
	const folder = folders.value.find(item => item.id === folderId)
	if (!folder) return
	if (!confirm(`Удалить папку "${folder.name}"? Все заметки из неё будут перенесены во "Входящие".`)) return

	notes.value = notes.value.map(note => (note.folderId === folderId ? { ...note, folderId: INBOX_FOLDER_ID } : note))
	folders.value = folders.value.filter(item => item.id !== folderId)
	if (selectedFolderId.value === folderId) selectedFolderId.value = INBOX_FOLDER_ID
	if (activeFolderId.value === folderId) activeFolderId.value = INBOX_FOLDER_ID
}

const addNote = () => {
	if (!newNoteText.value.trim()) return
	notes.value.unshift({
		text: newNoteText.value.trim(),
		date: Date.now(),
		folderId: selectedFolderId.value,
	})
	newNoteText.value = ''
}

const moveNoteToFolder = (index: number, folderId: string) => {
	if (!notes.value[index]) return
	if (!folders.value.some(folder => folder.id === folderId)) return
	notes.value[index].folderId = folderId
}

const deleteNote = (index: number) => notes.value.splice(index, 1)

const copyNote = async (text: string) => {
	try {
		await navigator.clipboard.writeText(text)
		alert('Скопировано в буфер обмена')
	} catch (err) {
		console.error('Ошибка копирования', err)
	}
}

const exportToTxt = () => {
	if (notes.value.length === 0) return alert('Нет заметок для экспорта')

	const content = folders.value
		.map(folder => {
			const folderNotes = notes.value.filter(note => note.folderId === folder.id)
			if (!folderNotes.length) return ''
			const notesContent = folderNotes
				.map(note => `[${formatDate(note.date)}]\n${note.text}\n${'-'.repeat(40)}\n`)
				.join('\n')
			return `### ${folder.name} ###\n\n${notesContent}`
		})
		.filter(Boolean)
		.join('\n\n')

	const blob = new Blob([content], { type: 'text/plain' })
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = `notes_${new Date().toISOString().slice(0, 19)}.txt`
	a.click()
	URL.revokeObjectURL(url)
}

const clearAllNotes = () => {
	if (confirm('Удалить все заметки?')) notes.value = []
}

const formatDate = (timestamp: number) => new Date(timestamp).toLocaleString()

const notesCountByFolder = (folderId: string) => notes.value.filter(note => note.folderId === folderId).length

defineExpose({ setNewNoteText })
</script>

<style scoped>
/* оставил как было */
.notes-overlay {
	position: fixed;
	inset: 0;
	background-color: rgba(0, 0, 0, 0.5);
	z-index: 1000;
	display: flex;
	justify-content: flex-end;
	padding-left: 16px;
	box-sizing: border-box;
}

.notes-panel {
	width: min(420px, 100%);
	max-width: 100%;
	height: 100%;
	max-height: var(--viewport-height);
	background: #2f2f2f;
	color: #ececec;
	display: flex;
	flex-direction: column;
	box-shadow: -2px 0 10px rgba(0, 0, 0, 0.3);
	animation: slideIn 0.2s ease-out;
}

@keyframes slideIn {
	from {
		transform: translateX(100%);
	}
	to {
		transform: translateX(0);
	}
}

.slide-enter-active .notes-panel {
	animation: slideIn 0.2s ease-out;
}

.slide-leave-active .notes-panel {
	animation: slideOut 0.2s ease-in;
}

@keyframes slideOut {
	from {
		transform: translateX(0);
	}
	to {
		transform: translateX(100%);
	}
}

.notes-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 16px;
	border-bottom: 1px solid #444;
}

.notes-header h3 {
	margin: 0;
}

.close-btn {
	background: none;
	border: none;
	color: white;
	font-size: 20px;
	cursor: pointer;
}

.notes-content {
	flex: 1;
	overflow-y: auto;
	padding: 16px;
	display: flex;
	flex-direction: column;
	gap: 20px;
}

.folder-controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.add-folder {
	display: flex;
	gap: 10px;
	flex-wrap: wrap;
}

.add-folder input,
.folder-select,
.note-actions select {
	background: #1e1e1e;
	border: 1px solid #444;
	border-radius: 12px;
	padding: 8px;
	color: white;
	font-family: inherit;
}

.add-folder input,
.folder-select {
	flex: 1;
}

.add-folder button {
	background: #2563eb;
	border: none;
	padding: 8px 12px;
	border-radius: 20px;
	color: white;
	cursor: pointer;
}

.folder-list {
	display: flex;
	gap: 8px;
	flex-wrap: wrap;
}

.folder-chip {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	border: 1px solid #444;
	background: #1e1e1e;
	color: #ececec;
	border-radius: 20px;
	padding: 6px 10px;
	cursor: pointer;
}

.folder-chip.active {
	background: #10a37f;
	border-color: #10a37f;
}

.delete-folder {
	font-size: 12px;
	opacity: 0.8;
}

.add-note {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.add-note textarea {
	background: #1e1e1e;
	border: 1px solid #444;
	border-radius: 12px;
	padding: 10px;
	color: white;
	font-family: inherit;
	resize: vertical;
}

.add-note-actions {
	display: flex;
	gap: 10px;
	flex-wrap: wrap;
}

.add-note button {
	background: #10a37f;
	border: none;
	padding: 8px;
	border-radius: 20px;
	color: white;
	cursor: pointer;
	flex: 1;
}

.add-note button:disabled,
.add-folder button:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.notes-list {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.note-item {
	background: #1e1e1e;
	border-radius: 16px;
	padding: 12px;
	border-left: 3px solid #10a37f;
}

.note-item p {
	margin: 0 0 8px 0;
	white-space: pre-wrap;
	word-break: break-word;
}

.note-actions {
	display: flex;
	justify-content: space-between;
	align-items: center;
	font-size: 12px;
	color: #aaa;
	gap: 8px;
	flex-wrap: wrap;
}

.note-actions button {
	background: none;
	border: none;
	cursor: pointer;
	font-size: 14px;
	margin-left: 4px;
}

.empty-notes {
	text-align: center;
	color: #aaa;
	padding: 20px;
}

.notes-footer {
	padding: 16px;
	border-top: 1px solid #444;
	display: flex;
	gap: 12px;
	justify-content: space-between;
	flex-wrap: wrap;
}

.export-btn,
.clear-btn {
	flex: 1;
	padding: 8px;
	border: none;
	border-radius: 20px;
	cursor: pointer;
}

.export-btn {
	background: #10a37f;
	color: white;
}

.clear-btn {
	background: #444;
	color: #ececec;
}

.clear-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

@media (max-width: 768px) {
	.notes-overlay {
		padding-left: 0;
	}

	.notes-panel {
		width: min(100%, 520px);
	}
}

@media (max-width: 560px) {
	.notes-panel {
		width: 100%;
		max-width: 100%;
	}

	.notes-header,
	.notes-content,
	.notes-footer {
		padding-inline: 12px;
	}

	.add-folder button,
	.add-note button,
	.export-btn,
	.clear-btn {
		width: 100%;
	}

	.folder-select,
	.note-actions select {
		width: 100%;
	}
}
</style>