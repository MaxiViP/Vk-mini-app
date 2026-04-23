import crypto from 'node:crypto'

import prisma from '../../db/prisma.js'
import { AppError } from '../../shared/errors.js'
import { ensurePlanCatalogSeeded, expireElapsedSubscriptions, getActiveSubscriptionWithPlan } from '../billing/billing.service.js'
import { aiClient } from './ai.client.js'
import { workspaceService } from '../workspace/workspace.service.js'

const AI_PRODUCT_TYPE = 'ai'
const AI_PROVIDER = 'vk_ai'
const AI_HISTORY_PROVIDER = 'aivk'
const AI_MEMORY_MAX_LENGTH = 1200
const AI_SESSION_CONTEXT_MAX_LENGTH = 1200
const AI_MEMORY_CACHE_TTL_MS = 15000
const AI_HISTORY_STORAGE_UNAVAILABLE = Symbol('AI_HISTORY_STORAGE_UNAVAILABLE')
const aiMemoryCache = new Map()

const USAGE_MODELS = {
	chat: 'chat',
	voice: 'voice',
	fileUpload: 'file_upload',
}

const emptyCounters = () => ({
	chat: 0,
	voice: 0,
	fileUpload: 0,
})

const serializePlan = plan =>
	plan
		? {
				id: plan.id,
				code: plan.code,
				name: plan.name,
				productType: plan.productType,
				priceMinor: plan.priceMinor,
				intervalDays: plan.intervalDays,
				includedRequests: plan.includedRequests,
				accessTier: plan.accessTier,
				aiChatLimit: plan.aiChatLimit ?? null,
				aiVoiceLimit: plan.aiVoiceLimit ?? null,
				aiFileUploadLimit: plan.aiFileUploadLimit ?? null,
				isActive: plan.isActive,
			}
		: null

const serializeSubscription = subscription =>
	subscription
		? {
				id: subscription.id,
				status: subscription.status,
				startedAt: subscription.periodStart,
				expiresAt: subscription.periodEnd,
				cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
			}
		: null

const buildLimits = plan => ({
	chat: Number(plan?.aiChatLimit || 0),
	voice: Number(plan?.aiVoiceLimit || 0),
	fileUpload: Number(plan?.aiFileUploadLimit || 0),
})

const buildCapabilities = limits => ({
	chat: limits.chat > 0,
	voice: limits.voice > 0,
	fileUpload: limits.fileUpload > 0,
})

const buildRemaining = (limits, usage) => ({
	chat: Math.max(limits.chat - usage.chat, 0),
	voice: Math.max(limits.voice - usage.voice, 0),
	fileUpload: Math.max(limits.fileUpload - usage.fileUpload, 0),
})

const getLatestAiSubscription = userId =>
	prisma.subscription.findFirst({
		where: {
			userId,
			plan: { is: { productType: AI_PRODUCT_TYPE } },
		},
		orderBy: [{ periodEnd: 'desc' }, { createdAt: 'desc' }],
		include: { plan: true },
	})

const getUsageSnapshot = async activeSubscription => {
	if (!activeSubscription) return emptyCounters()

	const rows = await prisma.usageEvent.groupBy({
		by: ['modelName'],
		where: {
			userId: activeSubscription.userId,
			modelProvider: AI_PROVIDER,
			subscriptionId: activeSubscription.id,
			status: 'completed',
			createdAt: {
				gte: activeSubscription.periodStart,
				lte: activeSubscription.periodEnd,
			},
		},
		_count: { modelName: true },
	})

	const counters = emptyCounters()
	for (const row of rows) {
		if (row.modelName === USAGE_MODELS.chat) counters.chat = row._count.modelName
		if (row.modelName === USAGE_MODELS.voice) counters.voice = row._count.modelName
		if (row.modelName === USAGE_MODELS.fileUpload) counters.fileUpload = row._count.modelName
	}

	return counters
}

const resolveAccessState = async userId => {
	await expireElapsedSubscriptions(prisma, userId, AI_PRODUCT_TYPE)

	const [activeSubscription, latestSubscription] = await Promise.all([
		getActiveSubscriptionWithPlan(prisma, userId, { productType: AI_PRODUCT_TYPE }),
		getLatestAiSubscription(userId),
	])

	const referencePlan = activeSubscription?.plan || latestSubscription?.plan || null
	const limits = buildLimits(referencePlan)
	const usage = await getUsageSnapshot(activeSubscription)
	const remaining = buildRemaining(limits, usage)
	const capabilities = buildCapabilities(limits)

	return {
		hasAccess: Boolean(activeSubscription),
		activeSubscription,
		latestSubscription,
		subscription: serializeSubscription(activeSubscription || latestSubscription),
		plan: serializePlan(referencePlan),
		limits,
		usage,
		remaining,
		capabilities,
	}
}

const assertSubscriptionActive = async userId => {
	const access = await resolveAccessState(userId)

	if (access.activeSubscription) return access

	if (access.latestSubscription) {
		throw new AppError('AI subscription has expired', 403, {
			code: 'AI_SUBSCRIPTION_EXPIRED',
		})
	}

	throw new AppError('AI subscription is required', 403, {
		code: 'AI_SUBSCRIPTION_REQUIRED',
	})
}

const assertCapability = (access, capability) => {
	if (!access.capabilities[capability]) {
		throw new AppError('AI feature is disabled for current plan', 403, {
			code: 'AI_FEATURE_DISABLED',
			capability,
		})
	}
}

const assertRemaining = (access, capability) => {
	if (access.remaining[capability] <= 0) {
		throw new AppError('AI limit reached', 402, {
			code: 'AI_LIMIT_REACHED',
			capability,
		})
	}
}

const createUsageEvent = ({ userId, subscription, modelName }) =>
	prisma.usageEvent.create({
		data: {
			userId,
			modelProvider: AI_PROVIDER,
			modelName,
			billingTier: subscription?.plan?.accessTier || 'basic',
			billingSource: 'subscription_included',
			status: 'completed',
			subscriptionId: subscription?.id || null,
			inputTokens: 0,
			outputTokens: 0,
			costMinor: 0,
			requestId: `${AI_PROVIDER}_${modelName}_${crypto.randomUUID()}`,
		},
	})

const AI_HISTORY_SOURCE = 'vk_ai'
const AI_CONVERSATION_TITLE_MAX_LENGTH = 255
const toExternalUserId = userId => String(userId)
const normalizeAiBlock = (value, maxLength) => String(value || '').slice(0, maxLength).trim()
const normalizeAiChatMode = value => (String(value || '').toLowerCase() === 'simple' ? 'simple' : 'context')
const normalizeAiMessageContent = value => String(value || '').trim()
const normalizeAiConversationTitle = value => {
	const normalized = normalizeAiMessageContent(value).slice(0, AI_CONVERSATION_TITLE_MAX_LENGTH)
	return normalized || null
}
const resolveConversationKey = ({ userId, conversationId, mode = 'context' }) =>
	String(conversationId || '').trim() || `aivk-${normalizeAiChatMode(mode)}-${userId}`
const buildAiPromptMessage = ({ userMemory, sessionContext, message }) =>
	[
		userMemory ? `ИНСТРУКЦИЯ:\n${userMemory}` : '',
		sessionContext ? `КОНТЕКСТ:\n${sessionContext}` : '',
		`ВОПРОС:\n${message}`,
	]
		.filter(Boolean)
		.join('\n\n')
const getCachedAiMemory = async userId => {
	const key = String(userId)
	const now = Date.now()
	const cached = aiMemoryCache.get(key)

	if (cached && cached.expiresAt > now) {
		return cached.value
	}

	const { aiMemory } = await workspaceService.getAiMemory(userId)
	const normalized = normalizeAiBlock(aiMemory, AI_MEMORY_MAX_LENGTH)
	aiMemoryCache.set(key, {
		value: normalized,
		expiresAt: now + AI_MEMORY_CACHE_TTL_MS,
	})
	return normalized
}
const setCachedAiMemory = (userId, aiMemory) => {
	aiMemoryCache.set(String(userId), {
		value: normalizeAiBlock(aiMemory, AI_MEMORY_MAX_LENGTH),
		expiresAt: Date.now() + AI_MEMORY_CACHE_TTL_MS,
	})
}

const isAiHistoryStorageUnavailable = error => {
	if (!error) return false
	if (error.code === 'P2021' || error.code === 'P2022' || error.code === 'P1001') return true
	const message = String(error.message || '').toLowerCase()
	return (
		(
			(message.includes('ai_messages') || message.includes('ai_conversations')) &&
			(message.includes('does not exist') || message.includes("doesn't exist"))
		) ||
		message.includes("can't reach database server") ||
		message.includes('connection refused') ||
		message.includes('econnrefused') ||
		message.includes('prisma client is not initialized')
	)
}

const ensureAiConversation = async ({ userId, conversationKey, mode, title }) => {
	const normalizedConversationKey = String(conversationKey || '').trim()
	if (!normalizedConversationKey) return AI_HISTORY_STORAGE_UNAVAILABLE

	try {
		let conversation = await prisma.aiConversation.findUnique({
			where: { conversationKey: normalizedConversationKey },
		})

		if (!conversation) {
			try {
				return await prisma.aiConversation.create({
					data: {
						userId,
						conversationKey: normalizedConversationKey,
						title: normalizeAiConversationTitle(title),
						provider: AI_HISTORY_PROVIDER,
						mode: normalizeAiChatMode(mode),
						status: 'active',
						source: AI_HISTORY_SOURCE,
					},
				})
			} catch (error) {
				if (error?.code !== 'P2002') {
					if (isAiHistoryStorageUnavailable(error)) {
						return AI_HISTORY_STORAGE_UNAVAILABLE
					}
					throw error
				}

				conversation = await prisma.aiConversation.findUnique({
					where: { conversationKey: normalizedConversationKey },
				})
			}
		}

		if (!conversation) {
			throw new AppError('AI conversation could not be created', 500, {
				code: 'AI_CONVERSATION_CREATE_FAILED',
			})
		}

		if (conversation.userId !== userId) {
			throw new AppError('AI conversation key conflict', 409, {
				code: 'AI_CONVERSATION_KEY_CONFLICT',
			})
		}

		const nextTitle = normalizeAiConversationTitle(title)
		const nextMode = normalizeAiChatMode(mode)
		const needsUpdate =
			conversation.mode !== nextMode ||
			conversation.provider !== AI_HISTORY_PROVIDER ||
			conversation.source !== AI_HISTORY_SOURCE ||
			conversation.status !== 'active' ||
			(!conversation.title && nextTitle)

		if (!needsUpdate) {
			return conversation
		}

		return await prisma.aiConversation.update({
			where: { id: conversation.id },
			data: {
				mode: nextMode,
				provider: AI_HISTORY_PROVIDER,
				source: AI_HISTORY_SOURCE,
				status: 'active',
				...(conversation.title ? {} : nextTitle ? { title: nextTitle } : {}),
			},
		})
	} catch (error) {
		if (isAiHistoryStorageUnavailable(error)) {
			return AI_HISTORY_STORAGE_UNAVAILABLE
		}
		throw error
	}
}

const touchAiConversation = async ({ conversation, role, title }) => {
	if (!conversation || conversation === AI_HISTORY_STORAGE_UNAVAILABLE) {
		return AI_HISTORY_STORAGE_UNAVAILABLE
	}

	try {
		return await prisma.aiConversation.update({
			where: { id: conversation.id },
			data: {
				status: 'active',
				lastMessageAt: new Date(),
				...((role === 'user' || role === 'assistant') ? { messageCount: { increment: 1 } } : {}),
				...(!conversation.title && normalizeAiConversationTitle(title)
					? { title: normalizeAiConversationTitle(title) }
					: {}),
			},
		})
	} catch (error) {
		if (isAiHistoryStorageUnavailable(error)) {
			return AI_HISTORY_STORAGE_UNAVAILABLE
		}
		throw error
	}
}

const persistAiMessage = async ({
	userId,
	conversationId,
	role,
	content,
	mode,
	status = 'completed',
	metadata,
	conversation = null,
}) => {
	const normalizedContent = normalizeAiMessageContent(content)
	if (!normalizedContent) return null

	try {
		const conversationRow =
			conversation && conversation !== AI_HISTORY_STORAGE_UNAVAILABLE
				? conversation
				: await ensureAiConversation({
						userId,
						conversationKey: conversationId,
						mode,
						title: role === 'user' ? normalizedContent : null,
					})

		if (conversationRow === AI_HISTORY_STORAGE_UNAVAILABLE) {
			return AI_HISTORY_STORAGE_UNAVAILABLE
		}

		const createdMessage = await prisma.aiMessage.create({
			data: {
				userId,
				conversationId: conversationRow.id,
				role,
				content: normalizedContent,
				mode: normalizeAiChatMode(mode),
				provider: AI_HISTORY_PROVIDER,
				status,
				metadataJson: metadata && typeof metadata === 'object' ? metadata : undefined,
			},
		})

		await touchAiConversation({
			conversation: conversationRow,
			role,
			title: role === 'user' ? normalizedContent : null,
		})

		return createdMessage
	} catch (error) {
		if (isAiHistoryStorageUnavailable(error)) {
			return AI_HISTORY_STORAGE_UNAVAILABLE
		}
		throw error
	}
}

const serializeStoredConversation = ({ userId, conversationId, rows = [] }) => {
	const messages = []
	const files = new Set()
	const voiceRecords = new Set()

	for (const row of rows) {
		if (row.role === 'user' || row.role === 'assistant') {
			messages.push({
				role: row.role,
				content: row.content,
			})
		}

		const metadata = row.metadataJson && typeof row.metadataJson === 'object' ? row.metadataJson : null
		if (!metadata) continue

		if (metadata.kind === 'file_upload' && typeof metadata.filename === 'string' && metadata.filename.trim()) {
			files.add(metadata.filename)
		}

		if (metadata.kind === 'voice_input') {
			if (typeof metadata.fileName === 'string' && metadata.fileName.trim()) {
				voiceRecords.add(metadata.fileName)
			} else if (typeof metadata.transcript === 'string' && metadata.transcript.trim()) {
				voiceRecords.add(metadata.transcript.slice(0, 80))
			}
		}
	}

	return {
		user_id: String(userId),
		conversation_id: conversationId,
		message_count: messages.length,
		messages,
		files: Array.from(files),
		voice_records: Array.from(voiceRecords),
	}
}

const loadStoredConversation = async ({ userId, conversationId }) => {
	try {
		const conversation = await prisma.aiConversation.findFirst({
			where: {
				userId,
				conversationKey: conversationId,
				status: { not: 'deleted' },
			},
		})

		if (!conversation) {
			return serializeStoredConversation({ userId, conversationId, rows: [] })
		}

		const rows = await prisma.aiMessage.findMany({
			where: {
				userId,
				conversationId: conversation.id,
			},
			orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
		})

		return serializeStoredConversation({ userId, conversationId, rows })
	} catch (error) {
		if (isAiHistoryStorageUnavailable(error)) {
			return AI_HISTORY_STORAGE_UNAVAILABLE
		}
		throw error
	}
}

const deleteStoredConversation = async ({ userId, conversationId }) => {
	try {
		const conversation = await prisma.aiConversation.findFirst({
			where: {
				userId,
				conversationKey: conversationId,
			},
		})

		if (!conversation) {
			return {
				status: 'ok',
				user_id: String(userId),
				conversation_id: conversationId,
			}
		}

		await prisma.aiMessage.deleteMany({
			where: {
				userId,
				conversationId: conversation.id,
			},
		})

		await prisma.aiConversation.update({
			where: { id: conversation.id },
			data: {
				messageCount: 0,
				lastMessageAt: null,
				status: 'active',
			},
		})

		return {
			status: 'ok',
			user_id: String(userId),
			conversation_id: conversationId,
		}
	} catch (error) {
		if (isAiHistoryStorageUnavailable(error)) {
			return AI_HISTORY_STORAGE_UNAVAILABLE
		}
		throw error
	}
}

const listStoredConversations = async ({ userId }) => {
	try {
		const rows = await prisma.aiConversation.findMany({
			where: {
				userId,
				status: { not: 'deleted' },
			},
			orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }, { createdAt: 'desc' }],
		})

		return rows.map(row => ({
			conversation_key: row.conversationKey,
			title: row.title,
			mode: row.mode,
			provider: row.provider,
			message_count: row.messageCount,
			last_message_at: row.lastMessageAt,
			status: row.status,
			source: row.source,
		}))
	} catch (error) {
		if (isAiHistoryStorageUnavailable(error)) {
			return AI_HISTORY_STORAGE_UNAVAILABLE
		}
		throw error
	}
}

export const aiService = {
	syncAiMemoryCache(userId, aiMemory) {
		setCachedAiMemory(userId, aiMemory)
	},

	async getPlans() {
		await ensurePlanCatalogSeeded()

		const plans = await prisma.plan.findMany({
			where: { productType: AI_PRODUCT_TYPE },
			orderBy: [{ isActive: 'desc' }, { priceMinor: 'asc' }],
		})

		return plans.map(serializePlan)
	},

	async getAccess({ userId }) {
		const access = await resolveAccessState(userId)

		return {
			hasAccess: access.hasAccess,
			subscription: access.subscription,
			plan: access.plan,
			limits: access.limits,
			usage: access.usage,
			remaining: access.remaining,
			capabilities: access.capabilities,
		}
	},

	async getBackendHealth() {
		return aiClient.health()
	},

	async sendChat({ userId, conversationId, message, sessionContext = '', mode = 'context' }) {
		const access = await assertSubscriptionActive(userId)
		assertCapability(access, 'chat')
		assertRemaining(access, 'chat')
		const chatMode = normalizeAiChatMode(mode)
		const resolvedConversationId = resolveConversationKey({ userId, conversationId, mode: chatMode })
		const normalizedUserMessage = normalizeAiMessageContent(message)
		const conversation = await ensureAiConversation({
			userId,
			conversationKey: resolvedConversationId,
			mode: chatMode,
			title: normalizedUserMessage,
		})
		let response

		await persistAiMessage({
			userId,
			conversationId: resolvedConversationId,
			role: 'user',
			content: normalizedUserMessage,
			mode: chatMode,
			conversation,
			metadata:
				chatMode === 'context' && typeof sessionContext === 'string' && sessionContext.trim()
					? { sessionContext: normalizeAiBlock(sessionContext, AI_SESSION_CONTEXT_MAX_LENGTH) }
					: undefined,
		})

		try {
			if (chatMode === 'simple') {
				response = await aiClient.simpleChat({
					message: normalizedUserMessage,
				})
			} else {
				const normalizedSessionContext = normalizeAiBlock(sessionContext, AI_SESSION_CONTEXT_MAX_LENGTH)
				const normalizedUserMemory = await getCachedAiMemory(userId)
				const fullMessage = buildAiPromptMessage({
					userMemory: normalizedUserMemory,
					sessionContext: normalizedSessionContext,
					message: normalizedUserMessage,
				})

				response = await aiClient.chat({
					userId: toExternalUserId(userId),
					conversationId: resolvedConversationId,
					message: fullMessage,
					sessionContext: normalizedSessionContext || undefined,
				})
			}
		} catch (error) {
			await persistAiMessage({
				userId,
				conversationId: resolvedConversationId,
				role: 'system',
				content: normalizeAiMessageContent(error?.message || 'AI request failed'),
				mode: chatMode,
				conversation,
				status: 'error',
				metadata: {
					code: error?.details?.code || error?.code || null,
					upstreamStatus: error?.details?.upstreamStatus || null,
					upstreamMessage: error?.details?.upstreamMessage || error?.message || null,
				},
			})
			throw error
		}

		await persistAiMessage({
			userId,
			conversationId: resolvedConversationId,
			role: 'assistant',
			content: response?.reply,
			mode: chatMode,
			conversation,
			metadata: {
				source_type: response?.source_type || null,
				sources: Array.isArray(response?.sources) ? response.sources : [],
				audio_reply_url: response?.audio_reply_url || null,
				transcript: response?.transcript || null,
				message_count: response?.message_count ?? null,
			},
		})

		await createUsageEvent({
			userId,
			subscription: access.activeSubscription,
			modelName: USAGE_MODELS.chat,
		})

		// Временное ограничение: audio_reply_url пробрасывается как есть, media-proxy на этом шаге не реализован.
		return {
			...response,
			user_id: response?.user_id || toExternalUserId(userId),
			conversation_id: response?.conversation_id || resolvedConversationId,
		}
	},

	async uploadFile({ userId, conversationId, file }) {
		const access = await assertSubscriptionActive(userId)
		assertCapability(access, 'fileUpload')
		assertRemaining(access, 'fileUpload')
		const resolvedConversationId = resolveConversationKey({ userId, conversationId, mode: 'context' })
		const conversation = await ensureAiConversation({
			userId,
			conversationKey: resolvedConversationId,
			mode: 'context',
			title: file?.name || 'upload',
		})

		const response = await aiClient.uploadFile({
			userId: toExternalUserId(userId),
			conversationId: resolvedConversationId,
			file,
		})

		await persistAiMessage({
			userId,
			conversationId: resolvedConversationId,
			role: 'user',
			content: `Файл "${response?.filename || file?.name || 'upload'}" добавлен в контекст`,
			mode: 'context',
			conversation,
			metadata: {
				kind: 'file_upload',
				filename: response?.filename || file?.name || null,
				status: response?.status || null,
				file_id: response?.file_id || null,
			},
		})

		await createUsageEvent({
			userId,
			subscription: access.activeSubscription,
			modelName: USAGE_MODELS.fileUpload,
		})

		return response
	},

	async sendVoice({ userId, conversationId, file }) {
		const access = await assertSubscriptionActive(userId)
		assertCapability(access, 'voice')
		assertRemaining(access, 'voice')
		const resolvedConversationId = resolveConversationKey({ userId, conversationId, mode: 'context' })
		const conversation = await ensureAiConversation({
			userId,
			conversationKey: resolvedConversationId,
			mode: 'context',
			title: file?.name || 'voice',
		})

		const response = await aiClient.voice({
			userId: toExternalUserId(userId),
			conversationId: resolvedConversationId,
			file,
		})

		await persistAiMessage({
			userId,
			conversationId: resolvedConversationId,
			role: 'user',
			content: response?.transcript || 'Голосовое сообщение',
			mode: 'context',
			conversation,
			metadata: {
				kind: 'voice_input',
				fileName: file?.name || null,
				transcript: response?.transcript || null,
			},
		})

		await persistAiMessage({
			userId,
			conversationId: resolvedConversationId,
			role: 'assistant',
			content: response?.reply,
			mode: 'context',
			conversation,
			metadata: {
				kind: 'voice_reply',
				fileName: file?.name || null,
				transcript: response?.transcript || null,
				source_type: response?.source_type || null,
				sources: Array.isArray(response?.sources) ? response.sources : [],
				audio_reply_url: response?.audio_reply_url || null,
			},
		})

		await createUsageEvent({
			userId,
			subscription: access.activeSubscription,
			modelName: USAGE_MODELS.voice,
		})

		// Временное ограничение: audio_reply_url пробрасывается как есть, media-proxy на этом шаге не реализован.
		return response
	},

	async listConversations({ userId }) {
		const access = await assertSubscriptionActive(userId)
		assertCapability(access, 'chat')
		const conversations = await listStoredConversations({ userId })

		if (conversations === AI_HISTORY_STORAGE_UNAVAILABLE) {
			return []
		}

		return conversations
	},

	async getConversation({ userId, conversationId }) {
		const access = await assertSubscriptionActive(userId)
		assertCapability(access, 'chat')
		const resolvedConversationId = resolveConversationKey({ userId, conversationId, mode: 'context' })
		const storedConversation = await loadStoredConversation({
			userId,
			conversationId: resolvedConversationId,
		})

		if (storedConversation !== AI_HISTORY_STORAGE_UNAVAILABLE) {
			return storedConversation
		}

		return aiClient.getConversation({
			userId: toExternalUserId(userId),
			conversationId: resolvedConversationId,
		})
	},

	async resetConversation({ userId, conversationId }) {
		await assertSubscriptionActive(userId)
		const resolvedConversationId = resolveConversationKey({ userId, conversationId, mode: 'context' })

		const upstreamReset = await aiClient.resetConversation({
			userId: toExternalUserId(userId),
			conversationId: resolvedConversationId,
		})

		const deletedConversation = await deleteStoredConversation({
			userId,
			conversationId: resolvedConversationId,
		})

		if (deletedConversation === AI_HISTORY_STORAGE_UNAVAILABLE) {
			return upstreamReset
		}

		return {
			...upstreamReset,
			user_id: upstreamReset?.user_id || String(userId),
			conversation_id: upstreamReset?.conversation_id || resolvedConversationId,
		}
	},
}
