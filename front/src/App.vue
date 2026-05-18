<template>
	<div :class="['app-container', chatModeClass]">
		<header class="top-bar">
			<AILogo />

			<div class="top-bar-spacer" aria-hidden="true"></div>

			<div class="top-bar-actions">
				<button :class="['pill-btn', { 'pill-btn--active': isChatContextOpen }]" @click="toggleChatContext">
					Контекст
				</button>
				<button class="pill-btn" @click="showNotes = true">Заметки</button>
				<button
					type="button"
					class="pill-btn theme-toggle"
					:aria-label="themeToggleAriaLabel"
					:aria-pressed="isLightTheme"
					@click="toggleUiTheme"
				>
					<span class="theme-toggle__icon" aria-hidden="true">{{ uiThemeIcon }}</span>
					<span class="theme-toggle__text">{{ uiThemeLabel }}</span>
				</button>
				<ProfileTrigger :is-admin="Boolean(userStore.user?.isAdmin)" @click="showProfile = true" @admin-click="showAdmin = true" />
			</div>

			<nav class="top-bar-nav" aria-label="Навигация">
				<button
					v-for="item in enabledNavigationItems"
					:key="item.panel"
					type="button"
					:class="['pill-btn', { 'pill-btn--active': activePanel === item.panel }]"
					@click="setActivePanel(item.panel)"
				>
					{{ item.label }}
				</button>
				<button
					v-if="!isVkAiBackend"
					:class="['pill-btn', { 'pill-btn--active': isModelSelectorOpen }]"
					@click="toggleModelSelector"
				>
					Модели
				</button>
			</nav>
		</header>

		<ModelSelector v-if="!isVkAiBackend && isModelSelectorOpen" />
		<component :is="currentPanelComponent" @navigate="setActivePanel" />
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

	<Teleport to="body">
		<Transition name="modal">
			<div v-if="showAdmin" class="modal-overlay" @click.self="showAdmin = false">
				<div class="modal-container">
					<button class="modal-close" @click="showAdmin = false">✕</button>
					<AdminPanel />
				</div>
			</div>
		</Transition>
	</Teleport>

	<AuthModal :visible="showAuthModal" @authenticated="showAuthModal = false" />
	<NotesPanel v-model:visible="showNotes" ref="notesPanelRef" />
	<ChatContextPanel v-model:visible="isChatContextOpen" />
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch } from 'vue'
import type { Component } from 'vue'

import { isVkAiBackend } from './config/chatBackend'
import { FEATURES, type FeatureName } from './config/features'
import { useActivityHeartbeat } from './composables/useActivityHeartbeat'
import { useAppWindowEvents } from './composables/useAppWindowEvents'
import { useOAuthCallback } from './composables/useOAuthCallback'
import { useViewportHeight } from './composables/useViewportHeight'
import { DEFAULT_VIEW_PANELS, type PanelId } from './config/panels'
import { initVK } from './vk/bridge'
import { useChatStore } from './stores/chat'
import { useModelsStore } from './stores/models'
import { isDevSessionRefreshToken, useUserStore } from './stores/user'
import { applyUiTheme, persistUiTheme, readStoredUiTheme, type UiTheme } from './theme'
import ProfileTrigger from './components/profile/ProfileTrigger.vue'
import Chat from './components/chat/Chat.vue'
import AILogo from './components/common/AILogo.vue'

const ModelSelector = defineAsyncComponent(() => import('./components/chat/ModelSelector.vue'))
const Profile = defineAsyncComponent(() => import('./components/profile/Profile.vue'))
const NotesPanel = defineAsyncComponent(() => import('./components/chat/NotesPanel.vue'))
const ChatContextPanel = defineAsyncComponent(() => import('./components/chat/ChatContextPanel.vue'))
const AuthModal = defineAsyncComponent(() => import('./components/auth/AuthModal.vue'))
const AdminPanel = defineAsyncComponent(() => import('./components/admin/AdminPanel.vue'))
const HomePanel = defineAsyncComponent(() => import('./panels/HomePanel.vue'))
const PromptsPanel = defineAsyncComponent(() => import('./panels/PromptsPanel.vue'))
const ToolsPanel = defineAsyncComponent(() => import('./panels/ToolsPanel.vue'))
const AssistantsPanel = defineAsyncComponent(() => import('./panels/AssistantsPanel.vue'))
const TariffsPanel = defineAsyncComponent(() => import('./panels/TariffsPanel.vue'))
const BonusesPanel = defineAsyncComponent(() => import('./panels/BonusesPanel.vue'))
const HelpPanel = defineAsyncComponent(() => import('./panels/HelpPanel.vue'))
const SafetyPanel = defineAsyncComponent(() => import('./panels/SafetyPanel.vue'))
const ChangelogPanel = defineAsyncComponent(() => import('./panels/ChangelogPanel.vue'))
const FeedbackPanel = defineAsyncComponent(() => import('./panels/FeedbackPanel.vue'))

const modelsStore = useModelsStore()
const chatStore = useChatStore()
const userStore = useUserStore()

type NavigationItem = {
	panel: PanelId
	label: string
	component: Component
	feature?: FeatureName
}

const defaultPanel = FEATURES.homePage ? DEFAULT_VIEW_PANELS.HOME : DEFAULT_VIEW_PANELS.CHAT

const navigationItems: NavigationItem[] = [
	{ panel: DEFAULT_VIEW_PANELS.HOME, label: 'Главная', component: HomePanel, feature: 'homePage' },
	{ panel: DEFAULT_VIEW_PANELS.CHAT, label: 'Чат', component: Chat },
	{ panel: DEFAULT_VIEW_PANELS.PROMPTS, label: 'Шаблоны', component: PromptsPanel, feature: 'promptCatalog' },
	{ panel: DEFAULT_VIEW_PANELS.TOOLS, label: 'Инструменты', component: ToolsPanel, feature: 'aiTools' },
	{ panel: DEFAULT_VIEW_PANELS.ASSISTANTS, label: 'Ассистенты', component: AssistantsPanel, feature: 'assistants' },
	{ panel: DEFAULT_VIEW_PANELS.TARIFFS, label: 'Тарифы', component: TariffsPanel, feature: 'tariffsPage' },
	{ panel: DEFAULT_VIEW_PANELS.BONUSES, label: 'Бонусы', component: BonusesPanel, feature: 'bonuses' },
	{ panel: DEFAULT_VIEW_PANELS.HELP, label: 'Помощь', component: HelpPanel, feature: 'helpPage' },
	{ panel: DEFAULT_VIEW_PANELS.SAFETY, label: 'Безопасность', component: SafetyPanel, feature: 'safetyPage' },
	{ panel: DEFAULT_VIEW_PANELS.CHANGELOG, label: 'Обновления', component: ChangelogPanel, feature: 'changelog' },
	{ panel: DEFAULT_VIEW_PANELS.FEEDBACK, label: 'Feedback', component: FeedbackPanel, feature: 'feedbackPage' },
]

const isNavigationItemEnabled = (item: NavigationItem) => !item.feature || FEATURES[item.feature]
const enabledNavigationItems = computed(() => navigationItems.filter(isNavigationItemEnabled))
const getPanelFromHash = () => window.location.hash.replace(/^#\/?/, '').split('?')[0] || defaultPanel
const resolvePanel = (panel: string): PanelId =>
	enabledNavigationItems.value.some(item => item.panel === panel) ? (panel as PanelId) : defaultPanel
const activePanel = ref<PanelId>(resolvePanel(getPanelFromHash()))
const currentNavigationItem = computed(
	() => enabledNavigationItems.value.find(item => item.panel === activePanel.value) || enabledNavigationItems.value[0],
)
const currentPanelComponent = computed(() => currentNavigationItem.value?.component || Chat)

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
const uiTheme = ref<UiTheme>(readStoredUiTheme())
const isLightTheme = computed(() => uiTheme.value === 'light')
const uiThemeLabel = computed(() => (isLightTheme.value ? 'Светлая' : 'Темная'))
const uiThemeIcon = computed(() => (isLightTheme.value ? '☀' : '☾'))
const themeToggleAriaLabel = computed(() =>
	isLightTheme.value ? 'Переключить на темную тему' : 'Переключить на светлую тему',
)

applyUiTheme(uiTheme.value)

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
	isChatContextOpen.value = !isChatContextOpen.value
}

const handleToggleChatContext = (event: Event) => {
	const customEvent = event as CustomEvent<{ open?: boolean }>
	if (typeof customEvent.detail?.open === 'boolean') {
		isChatContextOpen.value = customEvent.detail.open
		return
	}

	toggleChatContext()
}

const toggleModelSelector = () => {
	isModelSelectorOpen.value = !isModelSelectorOpen.value
}

const setActivePanel = (panel: string) => {
	const nextPanel = resolvePanel(panel)
	activePanel.value = nextPanel
	const nextHash = `#/${nextPanel}`
	if (window.location.hash !== nextHash) {
		window.location.hash = nextHash
	}
}

const handleHashChange = () => {
	const requestedPanel = getPanelFromHash()
	const nextPanel = resolvePanel(requestedPanel)
	activePanel.value = nextPanel

	if (requestedPanel !== nextPanel) {
		window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/${nextPanel}`)
	}
}

const toggleUiTheme = () => {
	const nextTheme: UiTheme = isLightTheme.value ? 'dark' : 'light'
	uiTheme.value = nextTheme
	persistUiTheme(nextTheme)
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
		return
	}

	if (isChatContextOpen.value) {
		isChatContextOpen.value = false
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

	if (userStore.refreshToken && !isDevSessionRefreshToken(userStore.refreshToken)) {
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
	window.addEventListener('hashchange', handleHashChange)
	window.addEventListener('toggle-chat-context', handleToggleChatContext as EventListener)
	handleHashChange()
	startAppWindowEvents()
	await bootstrapApp()
})

onUnmounted(() => {
	document.removeEventListener('keydown', handleEscape)
	window.removeEventListener('hashchange', handleHashChange)
	window.removeEventListener('toggle-chat-context', handleToggleChatContext as EventListener)
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
	color: var(--color-text);
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
		linear-gradient(180deg, rgba(0, 255, 194, 0.16) 0%, rgba(36, 209, 180, 0.12) 45%, rgba(36, 209, 180, 0.08) 100%),
		radial-gradient(circle at top right, rgba(0, 255, 194, 0.22), transparent 34%),
		radial-gradient(circle at bottom left, rgba(63, 114, 255, 0.12), transparent 30%),
		linear-gradient(180deg, rgba(6, 24, 28, 0.98) 0%, rgba(4, 12, 18, 1) 100%);

	background-attachment: fixed;
	background-size: cover;
}

.theme-toggle {
	min-height: 44px;
	padding-inline: 11px;
	border-color: var(--mode-accent-border);
	background: var(--color-control-bg);
	color: var(--color-text);
}

.theme-toggle:hover {
	background: var(--color-control-bg-hover);
}

.theme-toggle__icon {
	font-size: 15px;
	line-height: 1;
}

.theme-toggle__text {
	font-size: 13px;
	font-weight: 700;
}

:global(:root[data-ui-theme='light'] .theme-core) {
	--mode-accent: #2563eb;
	--mode-accent-soft: rgba(37, 99, 235, 0.1);
	--mode-accent-border: rgba(37, 99, 235, 0.24);
	--mode-accent-strong: #1d4ed8;
	--mode-accent-glow: rgba(37, 99, 235, 0.18);
	--mode-panel-bg: rgba(255, 255, 255, 0.74);
	--mode-panel-bg-strong: rgba(255, 255, 255, 0.92);
	background-color: #f8fbff;
	background:
		radial-gradient(circle at top left, rgba(59, 130, 246, 0.16), transparent 32%),
		linear-gradient(180deg, #ffffff 0%, #f8fbff 45%, #eef6ff 100%);
}

:global(:root[data-ui-theme='light'] .theme-ai) {
	--mode-accent: #059669;
	--mode-accent-soft: rgba(5, 150, 105, 0.1);
	--mode-accent-border: rgba(5, 150, 105, 0.24);
	--mode-accent-strong: #047857;
	--mode-accent-glow: rgba(5, 150, 105, 0.18);
	--mode-panel-bg: rgba(255, 255, 255, 0.74);
	--mode-panel-bg-strong: rgba(255, 255, 255, 0.92);
	background-color: #f7fffb;
	background:
		radial-gradient(circle at top right, rgba(16, 185, 129, 0.18), transparent 32%),
		radial-gradient(circle at bottom left, rgba(37, 99, 235, 0.08), transparent 30%),
		linear-gradient(180deg, #ffffff 0%, #f8fffc 45%, #ecfbf4 100%);
}

@media (max-width: 768px) {
	.top-bar {
		gap: 7px;
	}
}

@media (max-width: 560px) {
	.top-bar-nav {
		margin-inline: -12px;
		padding-inline: 12px;
	}
}

@media (max-width: 420px) {
	.top-bar {
		gap: 6px;
	}

	.top-bar-actions {
		gap: 6px;
	}

	.top-bar-nav {
		gap: 6px;
	}
}

@media (max-width: 640px) {
	.theme-toggle {
		width: 44px;
		min-width: 44px;
		padding-inline: 0;
	}

	.theme-toggle__text {
		display: none;
	}
}
</style>
