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

						<!-- Список заметок -->
						<div class="notes-list" v-if="notes.length > 0">
							<div v-for="(note, idx) in notes" :key="idx" class="note-item">
								<p>{{ note.text }}</p>
								<div class="note-actions">
									<span class="date">{{ formatDate(note.date) }}</span>
									<button @click="copyNote(note.text)" title="Копировать">📋</button>
									<button @click="deleteNote(idx)" title="Удалить">🗑️</button>
								</div>
							</div>
						</div>
						<div v-else class="empty-notes">
							<p>📭 Нет заметок. Добавьте первую!</p>
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
import { ref, watch, onMounted, onUnmounted } from 'vue'

interface Note {
	text: string
	date: number
}

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ (e: 'update:visible', value: boolean): void }>()

const notes = ref<Note[]>([])
const newNoteText = ref('')

// Метод для предзаполнения текста извне
const setNewNoteText = (text: string) => {
	newNoteText.value = text
}

// Загрузка заметок
onMounted(() => {
	const saved = localStorage.getItem('user_notes')
	if (saved) {
		try {
			notes.value = JSON.parse(saved)
		} catch (e) {}
	}
})

// Сохранение при изменении
watch(
	notes,
	newVal => {
		localStorage.setItem('user_notes', JSON.stringify(newVal))
	},
	{ deep: true },
)

const close = () => emit('update:visible', false)

const addNote = () => {
	if (!newNoteText.value.trim()) return
	notes.value.unshift({
		text: newNoteText.value.trim(),
		date: Date.now(),
	})
	newNoteText.value = ''
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
	const content = notes.value.map(note => `[${formatDate(note.date)}]\n${note.text}\n${'-'.repeat(40)}\n`).join('\n')
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
