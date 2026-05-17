// routes.ts
import { createHashRouter, createPanel, createRoot, createView, RoutesConfig } from '@vkontakte/vk-mini-apps-router'

import { FEATURES } from './config/features'
import { DEFAULT_VIEW_PANELS } from './config/panels'

export const DEFAULT_ROOT = 'default_root'
export const DEFAULT_VIEW = 'default_view'

const defaultPanel = FEATURES.homePage ? DEFAULT_VIEW_PANELS.HOME : DEFAULT_VIEW_PANELS.CHAT

const enabledPanels = [
	FEATURES.homePage ? createPanel(DEFAULT_VIEW_PANELS.HOME, '/', []) : null,
	createPanel(DEFAULT_VIEW_PANELS.CHAT, FEATURES.homePage ? `/${DEFAULT_VIEW_PANELS.CHAT}` : '/', []),
	FEATURES.promptCatalog ? createPanel(DEFAULT_VIEW_PANELS.PROMPTS, `/${DEFAULT_VIEW_PANELS.PROMPTS}`, []) : null,
	FEATURES.aiTools ? createPanel(DEFAULT_VIEW_PANELS.TOOLS, `/${DEFAULT_VIEW_PANELS.TOOLS}`, []) : null,
	FEATURES.assistants ? createPanel(DEFAULT_VIEW_PANELS.ASSISTANTS, `/${DEFAULT_VIEW_PANELS.ASSISTANTS}`, []) : null,
	FEATURES.tariffsPage ? createPanel(DEFAULT_VIEW_PANELS.TARIFFS, `/${DEFAULT_VIEW_PANELS.TARIFFS}`, []) : null,
	FEATURES.bonuses ? createPanel(DEFAULT_VIEW_PANELS.BONUSES, `/${DEFAULT_VIEW_PANELS.BONUSES}`, []) : null,
	FEATURES.helpPage ? createPanel(DEFAULT_VIEW_PANELS.HELP, `/${DEFAULT_VIEW_PANELS.HELP}`, []) : null,
	FEATURES.safetyPage ? createPanel(DEFAULT_VIEW_PANELS.SAFETY, `/${DEFAULT_VIEW_PANELS.SAFETY}`, []) : null,
	FEATURES.changelog ? createPanel(DEFAULT_VIEW_PANELS.CHANGELOG, `/${DEFAULT_VIEW_PANELS.CHANGELOG}`, []) : null,
	FEATURES.feedbackPage ? createPanel(DEFAULT_VIEW_PANELS.FEEDBACK, `/${DEFAULT_VIEW_PANELS.FEEDBACK}`, []) : null,
].filter(panel => panel !== null)

export const routes = RoutesConfig.create([
	createRoot(DEFAULT_ROOT, [createView(DEFAULT_VIEW, enabledPanels, defaultPanel)]),
])

export const router = createHashRouter(routes.getRoutes())
