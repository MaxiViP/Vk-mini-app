<template>
	<div class="app-container">
		<div class="top-bar">
			<button class="pill-btn" @click="showProfile = true">👤 Профиль</button>

			<AILogo />

			<button class="pill-btn" @click="showNotes = true">📎</button>
		</div>

		<ModelSelector />
		<Chat />
	</div>

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

	<NotesPanel v-model:visible="showNotes" ref="notesPanelRef" />
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { initVK } from './vk/bridge'
import { useModelsStore } from './stores/models'
import { useUserStore } from './stores/user'

import ModelSelector from './components/chat/ModelSelector.vue'
import Chat from './components/chat/Chat.vue'
import Profile from './components/profile/Profile.vue'
import NotesPanel from './components/chat/NotesPanel.vue'
import AILogo from './components/common/AILogo.vue'

type NotesPanelExposed = {
	setNewNoteText: (text: string) => void
}

const showProfile = ref(false)
const showNotes = ref(false)
const notesPanelRef = ref<NotesPanelExposed | null>(null)

const modelsStore = useModelsStore()
const userStore = useUserStore()

const handleSaveToNotes = (event: Event) => {
	const customEvent = event as CustomEvent<{ text: string }>
	showNotes.value = true
	notesPanelRef.value?.setNewNoteText(customEvent.detail.text)
}

const handleEscape = (e: KeyboardEvent) => {
	if (e.key !== 'Escape') return

	if (showProfile.value) {
		showProfile.value = false
		return
	}

	if (showNotes.value) {
		showNotes.value = false
	}
}

onMounted(async () => {
	document.addEventListener('keydown', handleEscape)
	window.addEventListener('save-to-notes', handleSaveToNotes as EventListener)

	await modelsStore.fetchModels()
	await userStore.initVKUser()
	initVK()
})

onUnmounted(() => {
	document.removeEventListener('keydown', handleEscape)
	window.removeEventListener('save-to-notes', handleSaveToNotes as EventListener)
})
</script>
