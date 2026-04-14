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
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

import { internalApiBaseUrl, isVkAiBackend } from './config/chatBackend'
import { initVK } from './vk/bridge'
import { useChatStore } from './stores/chat'
import { useModelsStore } from './stores/models'
import { useUserStore } from './stores/user'
import ProfileTrigger from './components/profile/ProfileTrigger.vue'
import ModelSelector from './components/chat/ModelSelector.vue'
import Chat from './components/chat/Chat.vue'
import Profile from './components/profile/Profile.vue'
import NotesPanel from './components/chat/NotesPanel.vue'
import AILogo from './components/common/AILogo.vue'
import AuthModal from './components/auth/AuthModal.vue'
import AdminPanel from './components/admin/AdminPanel.vue'

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

const ACTIVITY_INTERVAL_SEC = 30
const sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
let activityTimer: number | null = null
const isLikelyJwt = (token?: string | null) => Boolean(token && token.split('.').length === 3)
const OAUTH_CALLBACK_HANDLED_KEY = 'oauth_callback_handled'
let oauthCallbackInFlightKey: string | null = null
let oauthCallbackInFlightPromise: Promise<boolean> | null = null

const getOAuthCallbackKeyFromLocation = () => {
	const callbackMatch = window.location.pathname.match(/^\/oauth\/(vk|google|yandex)\/callback$/)
	if (!callbackMatch) return null

	const provider = callbackMatch[1]
	const params = new URLSearchParams(window.location.search)
	const code = params.get('code')
	const state = params.get('state')

	if (!code || !state) return null
	return `${provider}:${state}:${code}`
}

const readHandledOAuthCallbackKey = () => {
	try {
		return sessionStorage.getItem(OAUTH_CALLBACK_HANDLED_KEY)
	} catch {
		return null
	}
}

const writeHandledOAuthCallbackKey = (value: string) => {
	try {
		sessionStorage.setItem(OAUTH_CALLBACK_HANDLED_KEY, value)
	} catch {
		// ignore sessionStorage failures
	}
}

const clearOAuthCallbackFromLocation = () => {
	window.history.replaceState({}, document.title, '/')
}

const syncViewportHeight = () => {
	document.documentElement.style.setProperty('--viewport-height', `${window.innerHeight}px`)
}

const sendActivityHeartbeat = async () => {
	if (!userStore.token || !isLikelyJwt(userStore.token) || document.hidden) return

	try {
		await fetch(`${internalApiBaseUrl}/api/users/me/activity`, {
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
		const oauthCallbackKey = getOAuthCallbackKeyFromLocation()
		if (oauthCallbackKey) {
			if (readHandledOAuthCallbackKey() === oauthCallbackKey) {
				clearOAuthCallbackFromLocation()
				showAuthModal.value = false
			} else if (oauthCallbackInFlightKey === oauthCallbackKey && oauthCallbackInFlightPromise) {
				const oauthCallbackHandled = await oauthCallbackInFlightPromise
				if (oauthCallbackHandled) {
					showAuthModal.value = false
				}
			} else {
				oauthCallbackInFlightKey = oauthCallbackKey
				oauthCallbackInFlightPromise = userStore.finalizeOAuthCallbackFromLocation()
				const oauthCallbackHandled = await oauthCallbackInFlightPromise
				if (oauthCallbackHandled) {
					writeHandledOAuthCallbackKey(oauthCallbackKey)
					clearOAuthCallbackFromLocation()
					showAuthModal.value = false
				}
				oauthCallbackInFlightKey = null
				oauthCallbackInFlightPromise = null
			}
		}
	} catch (error) {
		oauthCallbackInFlightKey = null
		oauthCallbackInFlightPromise = null
		console.error('OAuth callback finalize error', error)
	}

	if (!userStore.isAuthenticated) {
		showAuthModal.value = true
	} else {
		if (userStore.refreshToken) {
			try {
				await userStore.refreshAuth()
			} catch (error) {
				console.warn('Auth refresh failed, fallback to existing session', error)
			}
		}
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
