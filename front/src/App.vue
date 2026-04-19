<template>
	<div :class="['app-container', chatModeClass]">
		<div class="top-bar">
			<AILogo />
			<button v-if="userStore.user?.isAdmin" class="pill-btn" @click="showAdmin = true">Админка</button>
 
			<ProfileTrigger @click="showProfile = true" />
			<div class="top-bar-left">
				<button
					v-if="!isVkAiBackend"
					:class="['pill-btn', { 'pill-btn--active': isModelSelectorOpen }]"
					@click="toggleModelSelector"
				>
					Модели
				</button>
				<button :class="['pill-btn', { 'pill-btn--active': isChatContextOpen }]" @click="toggleChatContext">
					Контекст
				</button>
				<button class="pill-btn" @click="showNotes = true">Заметки</button>
			</div>
			<!-- <div class="top-bar-right"></div> -->
		</div>

		<ModelSelector v-if="!isVkAiBackend && isModelSelectorOpen" />
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
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch } from 'vue'

import { isVkAiBackend } from './config/chatBackend'
import { useActivityHeartbeat } from './composables/useActivityHeartbeat'
import { useAppWindowEvents } from './composables/useAppWindowEvents'
import { useOAuthCallback } from './composables/useOAuthCallback'
import { useViewportHeight } from './composables/useViewportHeight'
import { initVK } from './vk/bridge'
import { useChatStore } from './stores/chat'
import { useModelsStore } from './stores/models'
import { useUserStore } from './stores/user'
import ProfileTrigger from './components/profile/ProfileTrigger.vue'
import Chat from './components/chat/Chat.vue'
import AILogo from './components/common/AILogo.vue'

const ModelSelector = defineAsyncComponent(() => import('./components/chat/ModelSelector.vue'))
const Profile = defineAsyncComponent(() => import('./components/profile/Profile.vue'))
const NotesPanel = defineAsyncComponent(() => import('./components/chat/NotesPanel.vue'))
const AuthModal = defineAsyncComponent(() => import('./components/auth/AuthModal.vue'))
const AdminPanel = defineAsyncComponent(() => import('./components/admin/AdminPanel.vue'))

const modelsStore = useModelsStore()
const chatStore = useChatStore()
const userStore = useUserStore()

type NotesPanelExposed = {
	setNewNoteText: (text: string) => void
}

const showProfile = ref(false)
const showNotes = ref(false)
const showAdmin = ref(false)
const showAuthModal = ref(false)
const isChatContextOpen = ref(false)
const isModelSelectorOpen = ref(false)
const notesPanelRef = ref<NotesPanelExposed | null>(null)
const chatModeClass = computed(() => (chatStore.chatMode === 'ai' ? 'theme-ai' : 'theme-core'))

const { handleOAuthCallback } = useOAuthCallback({
	finalizeOAuthCallbackFromLocation: userStore.finalizeOAuthCallbackFromLocation,
})
const { startActivityTracking, stopActivityTracking, sendActivityHeartbeat } = useActivityHeartbeat(userStore)
const { startViewportSync, stopViewportSync } = useViewportHeight()
const { startAppWindowEvents, stopAppWindowEvents } = useAppWindowEvents({
	onSaveToNotes: detail => {
		showNotes.value = true
		notesPanelRef.value?.setNewNoteText(detail.text)
	},
	onChatContextState: detail => {
		isChatContextOpen.value = Boolean(detail?.open)
	},
})

const toggleChatContext = () => {
	window.dispatchEvent(
		new CustomEvent('toggle-chat-context', {
			detail: { open: !isChatContextOpen.value },
		}),
	)
}

const toggleModelSelector = () => {
	isModelSelectorOpen.value = !isModelSelectorOpen.value
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

const loadModelsIfNeeded = async () => {
	if (isVkAiBackend) return

	try {
		await modelsStore.fetchModels()
	} catch (error) {
		console.error('Models fetch error', error)
	}
}

const initializeUserSession = async () => {
	userStore.hydrateAuth()

	const oauthCallbackHandled = await handleOAuthCallback()
	if (oauthCallbackHandled) {
		showAuthModal.value = false
	}

	if (!userStore.isAuthenticated) {
		showAuthModal.value = true
		return
	}

	if (userStore.refreshToken) {
		try {
			await userStore.refreshAuth()
		} catch (error) {
			console.warn('Auth refresh failed, fallback to existing session', error)
		}
	}

	await userStore.initVKUser()
}

const bootstrapApp = async () => {
	await loadModelsIfNeeded()
	await initializeUserSession()
	initVK()
	startActivityTracking()
	void sendActivityHeartbeat()
}

watch(
	() => userStore.isAuthenticated,
	isAuthenticated => {
		showAuthModal.value = !isAuthenticated
	},
	{ immediate: true },
)

onMounted(async () => {
	startViewportSync()
	document.addEventListener('keydown', handleEscape)
	startAppWindowEvents()
	await bootstrapApp()
})

onUnmounted(() => {
	document.removeEventListener('keydown', handleEscape)
	stopAppWindowEvents()
	stopViewportSync()
	stopActivityTracking()
})
</script>

<style scoped>
.app-container {
	--mode-accent: #6ea9ff;
	--mode-accent-soft: rgba(110, 169, 255, 0.16);
	--mode-accent-border: rgba(110, 169, 255, 0.32);
	--mode-accent-strong: #d9e9ff;
	--mode-accent-glow: rgba(110, 169, 255, 0.24);
	--mode-panel-bg: rgba(255, 255, 255, 0.04);
	--mode-panel-bg-strong: rgba(255, 255, 255, 0.06);
	transition:
		background 240ms ease,
		background-color 240ms ease,
		box-shadow 240ms ease;
}

.theme-core {
	--mode-accent: #6ea9ff;
	--mode-accent-soft: rgba(110, 169, 255, 0.16);
	--mode-accent-border: rgba(110, 169, 255, 0.32);
	--mode-accent-strong: #d9e9ff;
	--mode-accent-glow: rgba(110, 169, 255, 0.24);
	--mode-panel-bg: rgba(255, 255, 255, 0.04);
	--mode-panel-bg-strong: rgba(255, 255, 255, 0.06);
	background:
		radial-gradient(circle at top left, rgba(84, 132, 255, 0.16), transparent 36%),
		linear-gradient(180deg, rgba(12, 18, 34, 0.98) 0%, rgba(8, 12, 24, 1) 100%);
}

.theme-ai {
	--mode-accent: #24d1b4;
	--mode-accent-soft: rgba(36, 209, 180, 0.16);
	--mode-accent-border: rgba(36, 209, 180, 0.34);
	--mode-accent-strong: #c9fff3;
	--mode-accent-glow: rgba(36, 209, 180, 0.24);
	--mode-panel-bg: rgba(7, 34, 35, 0.5);
	--mode-panel-bg-strong: rgba(10, 43, 44, 0.72);
	background:
		radial-gradient(circle at top right, rgba(0, 255, 194, 0.2), transparent 34%),
		radial-gradient(circle at bottom left, rgba(63, 114, 255, 0.18), transparent 30%),
		linear-gradient(180deg, rgba(6, 24, 28, 0.98) 0%, rgba(4, 12, 18, 1) 100%);
}
</style>
