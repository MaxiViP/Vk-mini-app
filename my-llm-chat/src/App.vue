<template>
	<div class="app-container">
		<div class="top-bar">
			<button class="user-avatar" @click="showProfile = true">👤 Профиль</button>
			<button class="notes-btn" @click="showNotes = true">📎</button>
		</div>
		<ModelSelector />
		<Chat />
	</div>

	<!-- Модальное окно с профилем -->
	<Teleport to="body">
		<Transition name="modal">
			<div v-if="showProfile" class="modal-overlay" @click.self="showProfile = false">
				<div class="modal-container">
					<button class="modal-close" @click="showProfile = false">✕</button>
					<Profile />
				</div>
			</div>
		</Transition>
	</Teleport>

	<!-- Панель заметок (выезжает справа) -->
	<NotesPanel v-model:visible="showNotes" ref="notesPanelRef" />
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { initVK } from './vk/bridge'
import { useModelsStore } from './stores/models'
import { useUserStore } from './stores/user'
import ModelSelector from './components/ModelSelector.vue'
import Chat from './components/Chat.vue'
import Profile from './components/Profile.vue'
import NotesPanel from './components/NotesPanel.vue'

const showProfile = ref(false)
const showNotes = ref(false)
const notesPanelRef = ref<InstanceType<typeof NotesPanel> | null>(null)

const modelsStore = useModelsStore()
const userStore = useUserStore()

// Обработчик события сохранения в заметки (скрепка у сообщения)
const handleSaveToNotes = (event: CustomEvent) => {
	showNotes.value = true
	// Передаём текст в панель заметок (через ref или событие)
	if (notesPanelRef.value) {
		notesPanelRef.value.setNewNoteText(event.detail.text)
	}
}

// Закрытие по Escape
const handleEscape = (e: KeyboardEvent) => {
	if (e.key === 'Escape' && showProfile.value) showProfile.value = false
	if (e.key === 'Escape' && showNotes.value) showNotes.value = false
}

onMounted(() => {
	document.addEventListener('keydown', handleEscape)
	window.addEventListener('save-to-notes', handleSaveToNotes as EventListener)
})

onUnmounted(() => {
	document.removeEventListener('keydown', handleEscape)
	window.removeEventListener('save-to-notes', handleSaveToNotes as EventListener)
})

onMounted(async () => {
	await modelsStore.fetchModels()
	await userStore.initVKUser()
	initVK()
})
</script>

<style scoped>
.app-container {
	max-width: 1000px;
	margin: 0 auto;
	padding: 0 16px;
	width: 100%;
}

.top-bar {
	display: flex;
	justify-content: space-between;
	gap: 12px;
	margin-bottom: 8px;
}

.notes-btn,
.user-avatar {
	display: flex;
	justify-content: center;
	align-items: center;
	padding: 6px 12px;
	border: 1px solid #ff6b6b;
	border-radius: 20px;
	background: transparent;
	color: #ececec;
	cursor: pointer;
	font-size: 16px;
	transition: background 0.2s;
}

.notes-btn:hover,
.user-avatar:hover {
	background: rgba(255, 255, 255, 0.1);
}

/* Затемнённый фон */
.modal-overlay {
	position: fixed;
	top: 0;
	left: 0;
	width: 100%;
	height: 100%;
	background-color: rgba(0, 0, 0, 0.8);
	backdrop-filter: blur(4px);
	display: flex;
	align-items: center;
	justify-content: center;
	z-index: 1000;
}

/* Контейнер с профилем */
.modal-container {
	position: relative;
	max-width: 400px;
	width: 90%;
	background: transparent;
	border-radius: 28px;
}

/* Кнопка закрытия */
.modal-close {
	position: absolute;
	top: 12px;
	right: 16px;
	background: rgba(255, 255, 255, 0.2);
	border: none;
	font-size: 20px;
	font-weight: bold;
	color: white;
	cursor: pointer;
	width: 32px;
	height: 32px;
	border-radius: 50%;
	display: flex;
	align-items: center;
	justify-content: center;
	z-index: 10;
}

.modal-close:hover {
	background: rgba(255, 255, 255, 0.4);
}

/* Анимация */
.modal-enter-active,
.modal-leave-active {
	transition: opacity 0.2s ease;
}
.modal-enter-from,
.modal-leave-to {
	opacity: 0;
}
.modal-enter-active .modal-container,
.modal-leave-active .modal-container {
	transition: transform 0.2s ease;
}
.modal-enter-from .modal-container,
.modal-leave-to .modal-container {
	transform: scale(0.95);
}
</style>
