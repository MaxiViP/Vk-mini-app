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
						<!-- Форма добавления новой заметки -->
						<div class="add-note">
							<textarea v-model="newNoteText" placeholder="Вставьте текст заметки..." rows="3"></textarea>
							<button @click="addNote" :disabled="!newNoteText.trim()">➕ Добавить</button>
						</div>

						<div class="folders-panel">
							<div class="create-folder-row">
								<input
									v-model="newFolderName"
									type="text"
									placeholder="Новая папка..."
									@keyup.enter="createFolder"
									maxlength="40"
								/>
								<button @click="createFolder" :disabled="!newFolderName.trim()">📁 Создать</button>
							</div>

							<div class="folder-chips">
								<button
									class="folder-chip"
									:class="{ active: selectedFolderId === 'all' }"
									@click="selectedFolderId = 'all'"
								>
									Все ({{ notes.length }})
								</button>
								<button
									v-for="folder in folders"
									:key="folder.id"
									class="folder-chip"
									:class="{ active: selectedFolderId === folder.id }"
									@click="selectedFolderId = folder.id"
								>
									{{ folder.name }}
								</button>
							</div>
						</div>

						<!-- Список заметок -->
						<div class="notes-list" v-if="filteredNotes.length > 0">
							<div v-for="note in filteredNotes" :key="note.id" class="note-item">
								<p>{{ note.text }}</p>
								<div class="note-actions">
									<span class="date">{{ formatDate(note.date) }}</span>
									<select
										class="note-folder-select"
										:value="note.folderId"
										@change="moveNote(note.id, ($event.target as HTMLSelectElement).value)"
									>
										<option v-for="folder in folders" :key="folder.id" :value="folder.id">
											{{ folder.name }}
										</option>
									</select>
									<button @click="copyNote(note.text)" title="Копировать">📋</button>
									<button @click="deleteNote(note.id)" title="Удалить">🗑️</button>
								</div>
							</div>
						</div>
						<div v-else class="empty-notes">
							<p>📭 В этой папке пока нет заметок</p>
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

interface Note {
	id: string
	text: string
	date: number
	folderId: string
}

interface Folder {
	id: string
	name: string
	createdAt: number
}

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ (e: 'update:visible', value: boolean): void }>()

const NOTES_STORAGE_KEY = 'user_notes'
const FOLDERS_STORAGE_KEY = 'user_note_folders'
const DEFAULT_FOLDER_ID = 'inbox'

const notes = ref<Note[]>([])
const folders = ref<Folder[]>([{ id: DEFAULT_FOLDER_ID, name: 'Входящие', createdAt: Date.now() }])
const newNoteText = ref('')
const newFolderName = ref('')
const selectedFolderId = ref<'all' | string>('all')

const filteredNotes = computed(() =>
	selectedFolderId.value === 'all' ? notes.value : notes.value.filter(note => note.folderId === selectedFolderId.value),
)

const noteTargetFolder = computed(() => (selectedFolderId.value === 'all' ? DEFAULT_FOLDER_ID : selectedFolderId.value))

const uid = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

// Метод для предзаполнения текста извне (cSpell:ignore предзаполнения)
const setNewNoteText = (text: string) => {
	newNoteText.value = text
}

// Загрузка заметок
onMounted(() => {
	const savedNotes = localStorage.getItem(NOTES_STORAGE_KEY)
	if (savedNotes) {
		try {
			const parsed = JSON.parse(savedNotes)
			if (Array.isArray(parsed)) {
				notes.value = parsed
					.filter(note => typeof note?.text === 'string')
					.map(note => ({
						id: typeof note.id === 'string' ? note.id : uid(),
						text: note.text,
						date: typeof note.date === 'number' ? note.date : Date.now(),
						folderId: typeof note.folderId === 'string' ? note.folderId : DEFAULT_FOLDER_ID,
					}))
			}
		} catch (e) {
			console.error('Ошибка загрузки заметок', e)
		}
	}

	const savedFolders = localStorage.getItem(FOLDERS_STORAGE_KEY)
	if (savedFolders) {
		try {
			const parsed = JSON.parse(savedFolders)
			if (Array.isArray(parsed)) {
				const normalized = parsed
					.filter(folder => typeof folder?.name === 'string')
					.map(folder => ({
						id: typeof folder.id === 'string' ? folder.id : uid(),
						name: folder.name.trim() || 'Новая папка',
						createdAt: typeof folder.createdAt === 'number' ? folder.createdAt : Date.now(),
					}))
				folders.value = normalized.length ? normalized : folders.value
			}
		} catch (e) {
			console.error('Ошибка загрузки папок', e)
		}
	}

	if (!folders.value.some(folder => folder.id === DEFAULT_FOLDER_ID)) {
		folders.value.unshift({ id: DEFAULT_FOLDER_ID, name: 'Входящие', createdAt: Date.now() })
	}
})

// Сохранение при изменении
watch(
	notes,
	newVal => {
		localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(newVal))
	},
	{ deep: true },
)

watch(
	folders,
	newVal => {
		localStorage.setItem(FOLDERS_STORAGE_KEY, JSON.stringify(newVal))
	},
	{ deep: true },
)

const close = () => emit('update:visible', false)

const addNote = () => {
	if (!newNoteText.value.trim()) return
	notes.value.unshift({
		id: uid(),
		text: newNoteText.value.trim(),
		date: Date.now(),
		folderId: noteTargetFolder.value,
	})
	newNoteText.value = ''
}

const createFolder = () => {
	const normalizedName = newFolderName.value.trim()
	if (!normalizedName) return

	const exists = folders.value.some(folder => folder.name.toLowerCase() === normalizedName.toLowerCase())
	if (exists) {
		alert('Папка с таким именем уже существует')
		return
	}

	const newFolder: Folder = { id: uid(), name: normalizedName, createdAt: Date.now() }
	folders.value.push(newFolder)
	selectedFolderId.value = newFolder.id
	newFolderName.value = ''
}

const moveNote = (noteId: string, folderId: string) => {
	if (!folders.value.some(folder => folder.id === folderId)) return
	const note = notes.value.find(item => item.id === noteId)
	if (!note) return
	note.folderId = folderId
}

const deleteNote = (noteId: string) => {
	const index = notes.value.findIndex(note => note.id === noteId)
	if (index >= 0) notes.value.splice(index, 1)
}

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
	const notesByFolder = folders.value
		.map(folder => ({
			folderName: folder.name,
			items: notes.value.filter(note => note.folderId === folder.id),
		}))
		filter(group => group.items.length > 0)

	const content = notesByFolder
		.map(
			group =>
				`📁 ${group.folderName}\n${'='.repeat(40)}\n` +
				group.items.map(note => `[${formatDate(note.date)}]\n${note.text}\n${'-'.repeat(40)}\n`).join('\n'),
		)
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

defineExpose({ setNewNoteText })
</script>
<style scoped>
/* Затемнение фона */
.notes-overlay {
	position: fixed;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	background-color: rgba(0, 0, 0, 0.5);
	z-index: 1000;
	display: flex;
	justify-content: flex-end;
}

/* Панель, выезжающая справа */
.notes-panel {
	width: 380px;
	max-width: 90vw;
	height: 100%;
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

/* Анимация для Transition */
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

.add-note button {
	background: #10a37f;
	border: none;
	padding: 8px;
	border-radius: 20px;
	color: white;
	cursor: pointer;
}

.add-note button:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.folders-panel {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.create-folder-row {
	display: flex;
	gap: 8px;
}

.create-folder-row input {
	flex: 1;
	background: #1e1e1e;
	border: 1px solid #444;
	border-radius: 10px;
	padding: 8px 10px;
	color: #ececec;
}

.create-folder-row button {
	border: none;
	border-radius: 16px;
	background: #3c6ef8;
	color: #fff;
	padding: 8px 12px;
	cursor: pointer;
}

.create-folder-row button:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.folder-chips {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.folder-chip {
	border: 1px solid #4d4d4d;
	background: #2a2a2a;
	color: #ececec;
	border-radius: 14px;
	padding: 6px 10px;
	font-size: 12px;
	cursor: pointer;
}

.folder-chip.active {
	background: #10a37f;
	border-color: #10a37f;
	color: #fff;
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
}

.note-actions button {
	background: none;
	border: none;
	cursor: pointer;
	font-size: 14px;
	margin-left: 8px;
}

.note-folder-select {
	background: #242424;
	color: #d8d8d8;
	border: 1px solid #4a4a4a;
	border-radius: 8px;
	padding: 4px 8px;
	font-size: 12px;
	max-width: 140px;
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
</style>
