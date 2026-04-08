<template>
	<div class="app-container">
		<div class="top-bar">
			<div class="top-bar-left">
				<button class="pill-btn" @click="showProfile = true">
					<span class="btn-text">{{ fullName }}</span>
				</button>
				<button v-if="userStore.user?.isAdmin" class="pill-btn" @click="showAdmin = true">Админ</button>
				<button :class="['pill-btn', { 'pill-btn--active': isChatContextOpen }]" @click="toggleChatContext">Контекст</button>
			</div>

			<AILogo />

			<button class="pill-btn" @click="showNotes = true">Заметки</button>
		</div>

		<ModelSelector v-if="!isVkAiBackend" />
		<Chat />
	</div>

	<Teleport to="body">
		<Transition name="modal">
			<div v-if="showProfile" class="modal-overlay" @click.self="showProfile = false">
				<div class="modal-container">
					<button class="modal-close" @click="showProfile = false">x</button>
					<Profile />
				</div>
			</div>
		</Transition>
	</Teleport>

	<Teleport to="body">
		<Transition name="modal">
			<div v-if="showAdmin" class="modal-overlay" @click.self="showAdmin = false">
				<div class="modal-container">
					<button class="modal-close" @click="showAdmin = false">x</button>
					<AdminPanel />
				</div>
			</div>
		</Transition>
	</Teleport>

	<AuthModal :visible="showAuthModal" @authenticated="showAuthModal = false" />
	<NotesPanel v-model:visible="showNotes" ref="notesPanelRef" />
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

import { isVkAiBackend } from './config/chatBackend'
import { initVK } from './vk/bridge'
import { useModelsStore } from './stores/models'
import { useUserStore } from './stores/user'

import ModelSelector from './components/chat/ModelSelector.vue'
import Chat from './components/chat/Chat.vue'
import Profile from './components/profile/Profile.vue'
import NotesPanel from './components/chat/NotesPanel.vue'
import AILogo from './components/common/AILogo.vue'
import AuthModal from './components/auth/AuthModal.vue'
import AdminPanel from './components/admin/AdminPanel.vue'

const modelsStore = useModelsStore()
const userStore = useUserStore()

const fullName = computed(() => {
	if (!userStore.user) return 'Профиль'
	return `${userStore.user.firstName} ${userStore.user.lastName || ''}`.trim()
})

type NotesPanelExposed = {
	setNewNoteText: (text: string) => void
}

const showProfile = ref(false)
const showNotes = ref(false)
const showAdmin = ref(false)
const showAuthModal = ref(false)
const isChatContextOpen = ref(false)
const notesPanelRef = ref<NotesPanelExposed | null>(null)

const API_BASE_URL = ''
const ACTIVITY_INTERVAL_SEC = 30
const sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
let activityTimer: number | null = null
const isLikelyJwt = (token?: string | null) => Boolean(token && token.split('.').length === 3)

const syncViewportHeight = () => {
	document.documentElement.style.setProperty('--viewport-height', `${window.innerHeight}px`)
}

const sendActivityHeartbeat = async () => {
	if (!userStore.token || !isLikelyJwt(userStore.token) || document.hidden) return

	try {
		await fetch(`${API_BASE_URL}/api/users/me/activity`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${userStore.token}`,
			},
			body: JSON.stringify({
				sessionId,
				activeSeconds: ACTIVITY_INTERVAL_SEC,
				page: window.location.pathname,
				requestsCount: 0,
				notesMutations: 0,
				chatMessagesSent: 0,
			}),
		})
	} catch (error) {
		console.warn('Activity heartbeat failed', error)
	}
}

const startActivityTracking = () => {
	if (activityTimer) window.clearInterval(activityTimer)
	activityTimer = window.setInterval(() => {
		void sendActivityHeartbeat()
	}, ACTIVITY_INTERVAL_SEC * 1000)
}

const handleSaveToNotes = (event: Event) => {
	const customEvent = event as CustomEvent<{ text: string }>
	showNotes.value = true
	notesPanelRef.value?.setNewNoteText(customEvent.detail.text)
}

const handleChatContextState = (event: Event) => {
	const customEvent = event as CustomEvent<{ open?: boolean }>
	isChatContextOpen.value = Boolean(customEvent.detail?.open)
}

const toggleChatContext = () => {
	window.dispatchEvent(
		new CustomEvent('toggle-chat-context', {
			detail: { open: !isChatContextOpen.value },
		}),
	)
}

const handleEscape = (e: KeyboardEvent) => {
	if (e.key !== 'Escape') return
	if (showAuthModal.value) return

	if (showAdmin.value) {
		showAdmin.value = false
		return
	}

	if (showProfile.value) {
		showProfile.value = false
		return
	}

	if (showNotes.value) {
		showNotes.value = false
	}
}

watch(
	() => userStore.isAuthenticated,
	isAuthenticated => {
		showAuthModal.value = !isAuthenticated
	},
	{ immediate: true },
)

onMounted(async () => {
	syncViewportHeight()
	document.addEventListener('keydown', handleEscape)
	window.addEventListener('save-to-notes', handleSaveToNotes as EventListener)
	window.addEventListener('chat-context-state', handleChatContextState as EventListener)
	window.addEventListener('resize', syncViewportHeight)
	window.addEventListener('orientationchange', syncViewportHeight)

	try {
		if (!isVkAiBackend) {
			await modelsStore.fetchModels()
		}
	} catch (error) {
		console.error('Models fetch error', error)
	}

	userStore.hydrateAuth()
	try {
		await userStore.finalizeOAuthCallbackFromLocation()
	} catch (error) {
		console.error('OAuth callback finalize error', error)
	}

	if (!userStore.isAuthenticated) {
		showAuthModal.value = true
	} else {
		await userStore.initVKUser()
	}

	initVK()
	startActivityTracking()
	void sendActivityHeartbeat()
})

onUnmounted(() => {
	document.removeEventListener('keydown', handleEscape)
	window.removeEventListener('save-to-notes', handleSaveToNotes as EventListener)
	window.removeEventListener('chat-context-state', handleChatContextState as EventListener)
	window.removeEventListener('resize', syncViewportHeight)
	window.removeEventListener('orientationchange', syncViewportHeight)
	if (activityTimer) window.clearInterval(activityTimer)
})
</script>

<style scoped>
.pill-btn--active {
	background: rgba(16, 163, 127, 0.18);
	border-color: var(--color-primary);
	color: #b7ffed;
	box-shadow: 0 0 0 1px rgba(16, 163, 127, 0.18);
}
</style>
