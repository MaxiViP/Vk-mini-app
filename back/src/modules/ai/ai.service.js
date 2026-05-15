import crypto from 'node:crypto'

import prisma from '../../db/prisma.js'
import env from '../../config/env.js'
import logger from '../../config/logger.js'
import { AppError } from '../../shared/errors.js'
import {
	ensurePlanCatalogSeeded,
	expireElapsedSubscriptions,
	getActiveSubscriptionWithPlan,
} from '../billing/billing.service.js'
import { aiClient } from './ai.client.js'
import { workspaceService } from '../workspace/workspace.service.js'

const AI_PRODUCT_TYPE = 'ai'
const AI_PROVIDER = 'vk_ai'
const AI_HISTORY_PROVIDER = 'aivk'
const AI_MEMORY_MAX_LENGTH = 1200
const AI_SESSION_CONTEXT_MAX_LENGTH = 1200
const AI_SELECTED_FILES_MAX_COUNT = 50
const AI_LOCAL_HISTORY_MAX_MESSAGES = 20
const AI_LOCAL_HISTORY_MAX_CHARS = 12000
const AI_MEMORY_CACHE_TTL_MS = 0
const AI_HISTORY_STORAGE_UNAVAILABLE = Symbol('AI_HISTORY_STORAGE_UNAVAILABLE')
const aiMemoryCache = new Map()
const aiServiceLogger = logger.createChild({ module: 'ai-service' })

const FILE_UPLOAD_ALLOWED_MIME_TYPES = new Set([
	'text/plain',
	'text/csv',
	'application/pdf',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])

const FILE_UPLOAD_ALLOWED_EXTENSIONS = new Set(['txt', 'csv', 'pdf', 'docx', 'xlsx'])

const VOICE_ALLOWED_MIME_TYPES = new Set([
	'audio/webm',
	'audio/ogg',
	'audio/mpeg',
	'audio/mp3',
	'audio/wav',
	'audio/x-wav',
	'audio/mp4',
	'video/webm',
])

const VOICE_ALLOWED_EXTENSIONS = new Set(['webm', 'ogg', 'mp3', 'mpeg', 'wav', 'm4a', 'mp4'])

const USAGE_MODELS = {
	chat: 'chat',
	voice: 'voice',
	fileUpload: 'file_upload',
}

const ACTIVE_AI_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing', 'past_due'])

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

export const isAiSubscriptionActive = subscription => {
	if (!subscription || !ACTIVE_AI_SUBSCRIPTION_STATUSES.has(subscription.status)) return false

	const periodEnd = subscription.periodEnd || subscription.expiresAt
	const periodEndMs = periodEnd ? new Date(periodEnd).getTime() : 0
	return Number.isFinite(periodEndMs) && periodEndMs > Date.now()
}

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

	const hasActiveSubscription = isAiSubscriptionActive(activeSubscription)
	const activePlan = hasActiveSubscription ? activeSubscription.plan : null
	const limits = hasActiveSubscription ? buildLimits(activePlan) : emptyCounters()
	const usage = hasActiveSubscription ? await getUsageSnapshot(activeSubscription) : emptyCounters()
	const remaining = buildRemaining(limits, usage)
	const capabilities = buildCapabilities(limits)

	return {
		hasAccess: hasActiveSubscription,
		activeSubscription: hasActiveSubscription ? activeSubscription : null,
		latestSubscription,
		subscription: serializeSubscription(hasActiveSubscription ? activeSubscription : latestSubscription),
		plan: serializePlan(activePlan),
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
const buildDefaultVkConversationId = externalUserId => `vk_${externalUserId}_default`
const resolveExternalVkConversationId = ({ externalUserId, conversationId }) => {
	const normalizedConversationId = String(conversationId || '').trim()
	if (normalizedConversationId.startsWith('vk_')) return normalizedConversationId
	return buildDefaultVkConversationId(externalUserId)
}
const buildAiChatIdempotencyKey = ({ externalUserId, conversationId }) => {
	const nonce = crypto.randomUUID()
	const digest = crypto
		.createHash('sha256')
		.update(`${externalUserId}:${conversationId}:${nonce}`)
		.digest('hex')
		.slice(0, 32)
	return `vk_ai_chat_${digest}`
}
const isAiBackendFeatureUnsupported = error =>
	error instanceof AppError && error.details?.code === 'AI_BACKEND_FEATURE_UNSUPPORTED'
const normalizeAiBlock = (value, maxLength) =>
	String(value || '')
		.slice(0, maxLength)
		.trim()
const normalizeAiChatMode = value => (String(value || '').toLowerCase() === 'simple' ? 'simple' : 'context')
const normalizeAiMessageContent = value => String(value || '').trim()
const normalizeSelectedContextFiles = value =>
	Array.isArray(value)
		? Array.from(new Set(value.map(item => String(item || '').trim()).filter(Boolean))).slice(
				0,
				AI_SELECTED_FILES_MAX_COUNT,
			)
		: []
const buildAiChatOutboundMessage = ({ message, sessionContext, selectedFiles, hasSelectedFileFilter }) => {
	const normalizedMessage = normalizeAiMessageContent(message)
	const normalizedSessionContext = normalizeAiBlock(sessionContext, AI_SESSION_CONTEXT_MAX_LENGTH)
	const normalizedSelectedFiles = normalizeSelectedContextFiles(selectedFiles)
	const blocks = []

	if (normalizedSessionContext) {
		blocks.push(`ВРЕМЕННЫЙ КОНТЕКСТ ТЕКУЩЕЙ СЕССИИ:
${normalizedSessionContext}`)
	}

	if (hasSelectedFileFilter) {
		blocks.push(
			normalizedSelectedFiles.length
				? `ОГРАНИЧЕНИЕ ПО ФАЙЛАМ:
Отвечай только по выбранным файлам из контекста. Не используй другие загруженные файлы этой беседы, даже если они доступны в conversation context.

ВЫБРАННЫЕ ФАЙЛЫ:
${normalizedSelectedFiles.map((fileName, index) => `${index + 1}. ${fileName}`).join('\n')}`
				: `ОГРАНИЧЕНИЕ ПО ФАЙЛАМ:
В этой отправке файлы не выбраны. Не используй загруженные файлы этой беседы как источник ответа.`,
		)
	}

	if (!blocks.length) return normalizedMessage

	return `${blocks.join('\n\n')}\n\nВОПРОС ПОЛЬЗОВАТЕЛЯ:\n${normalizedMessage}`
}
const normalizeAiConversationTitle = value => {
	const normalized = normalizeAiMessageContent(value).slice(0, AI_CONVERSATION_TITLE_MAX_LENGTH)
	return normalized || null
}
const normalizeMimeType = value =>
	String(value || '')
		.split(';')[0]
		.trim()
		.toLowerCase()
const getFileExtension = file => {
	const name = String(file?.name || '')
	const index = name.lastIndexOf('.')
	return index >= 0 ? name.slice(index + 1).toLowerCase() : ''
}

const resolveExternalVkUserId = async userId => {
	const internalUserId = String(userId)

	try {
		const identity = await prisma.authIdentity.findFirst({
			where: {
				userId,
				provider: 'vk',
			},
			select: {
				providerUserId: true,
			},
		})

		const vkUserId = String(identity?.providerUserId || '').trim()

		return {
			externalUserId: internalUserId,
			vkUserId: vkUserId || null,
		}
	} catch (error) {
		aiServiceLogger.warn('VK auth identity lookup failed', {
			userId: internalUserId,
			code: error?.code || null,
			message: error?.message || 'Unknown DB error',
		})

		return {
			externalUserId: internalUserId,
			vkUserId: null,
		}
	}
}

const assertUploadSize = ({ file, maxBytes, code, message }) => {
	const size = Number(file?.size || 0)
	if (size <= maxBytes) return

	throw new AppError(message, 413, {
		code,
		size,
		maxBytes,
	})
}

const assertUploadType = ({ file, mimeTypes, extensions, code, message }) => {
	const mimeType = normalizeMimeType(file?.type)
	const extension = getFileExtension(file)
	const hasAllowedMimeType = mimeType && mimeTypes.has(mimeType)
	const hasAllowedExtension = extension && extensions.has(extension)

	if (hasAllowedMimeType || hasAllowedExtension) return

	throw new AppError(message, 415, {
		code,
		mimeType: mimeType || null,
		extension: extension || null,
	})
}

const assertContextFileAllowed = file => {
	assertUploadSize({
		file,
		maxBytes: Number(env.vkAiMaxFileBytes || 0),
		code: 'AI_FILE_TOO_LARGE',
		message: 'AI file is too large',
	})
	assertUploadType({
		file,
		mimeTypes: FILE_UPLOAD_ALLOWED_MIME_TYPES,
		extensions: FILE_UPLOAD_ALLOWED_EXTENSIONS,
		code: 'AI_FILE_TYPE_UNSUPPORTED',
		message: 'AI file type is unsupported',
	})
}

const assertVoiceFileAllowed = file => {
	assertUploadSize({
		file,
		maxBytes: Number(env.vkAiMaxAudioBytes || 0),
		code: 'AI_AUDIO_TOO_LARGE',
		message: 'AI audio file is too large',
	})
	assertUploadType({
		file,
		mimeTypes: VOICE_ALLOWED_MIME_TYPES,
		extensions: VOICE_ALLOWED_EXTENSIONS,
		code: 'AI_AUDIO_TYPE_UNSUPPORTED',
		message: 'AI audio type is unsupported',
	})
}

const resolveConversationKey = ({ userId, conversationId, mode = 'context' }) =>
	String(conversationId || '').trim() || `aivk-${normalizeAiChatMode(mode)}-${userId}`

const buildAiMemoryOnlyRequestMessage = ({ userMemory, message }) => {
	const normalizedMessage = normalizeAiMessageContent(message)
	const normalizedUserMemory = normalizeAiBlock(userMemory, AI_MEMORY_MAX_LENGTH)

	if (!normalizedUserMemory) {
		return normalizedMessage
	}

	return `ИНСТРУКЦИЯ:\n${normalizedUserMemory}\n\nВОПРОС:\n${normalizedMessage}`
}

const buildAiRequestMessageWithLocalContext = ({ userMemory, sessionContext, historyRows, message }) => {
	const normalizedMessage = normalizeAiMessageContent(message)
	const normalizedUserMemory = normalizeAiBlock(userMemory, AI_MEMORY_MAX_LENGTH)
	const normalizedSessionContext = normalizeAiBlock(sessionContext, AI_SESSION_CONTEXT_MAX_LENGTH)

	const historyText = historyRows
		.filter(row => row && (row.role === 'user' || row.role === 'assistant') && row.content)
		.map(row => `${row.role === 'user' ? 'ПОЛЬЗОВАТЕЛЬ' : 'AI'}: ${normalizeAiMessageContent(row.content)}`)
		.join('\n')
		.slice(-AI_LOCAL_HISTORY_MAX_CHARS)
		.trim()

	const systemRules = `СИСТЕМНЫЕ ПРАВИЛА:
Ты AI-помощник.

У тебя есть 4 источника данных:
1. Постоянная память пользователя.
2. Временный контекст текущей сессии.
3. История диалога.
4. Текущий вопрос пользователя.

ОБЯЗАТЕЛЬНО:
- Используй постоянную память ВСЕГДА, если она есть.
- Используй временный контекст ВСЕГДА, если он есть.
- Не выбирай между памятью и контекстом. Объединяй их.
- Память задаёт роль, стиль, предпочтения и постоянные правила.
- Контекст задаёт текущую задачу, временные вводные и ограничения.
- Если память и контекст не противоречат друг другу, применяй оба.
- Если есть прямое противоречие, сначала выполни временный контекст, но сохрани стиль и роль из памяти.
- Текущий вопрос пользователя — основная задача ответа.
- История диалога нужна только для продолжения разговора.

Нельзя игнорировать память только потому, что есть контекст.
Нельзя игнорировать контекст только потому, что есть память.`

	const prompt = [
		systemRules,

		normalizedUserMemory
			? `ПОСТОЯННАЯ ПАМЯТЬ ПОЛЬЗОВАТЕЛЯ:
${normalizedUserMemory}`
			: '',

		normalizedSessionContext
			? `ВРЕМЕННЫЙ КОНТЕКСТ ТЕКУЩЕЙ СЕССИИ:
${normalizedSessionContext}`
			: '',

		historyText
			? `ЛОКАЛЬНАЯ ИСТОРИЯ ДИАЛОГА:
${historyText}`
			: '',

		`ТЕКУЩИЙ ВОПРОС ПОЛЬЗОВАТЕЛЯ:
${normalizedMessage}`,
	]
		.filter(Boolean)
		.join('\n\n')

	console.log('[ai-context] built prompt', {
		hasUserMemory: Boolean(normalizedUserMemory),
		hasSessionContext: Boolean(normalizedSessionContext),
		historyMessages: historyRows.length,
		userMemoryLength: normalizedUserMemory.length,
		sessionContextLength: normalizedSessionContext.length,
		promptLength: prompt.length,
		promptPreview: prompt.slice(0, 800),
	})

	return prompt
}
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
		((message.includes('ai_messages') || message.includes('ai_conversations')) &&
			(message.includes('does not exist') || message.includes("doesn't exist"))) ||
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
				...(role === 'user' || role === 'assistant' ? { messageCount: { increment: 1 } } : {}),
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

const loadLocalPromptHistory = async ({ userId, conversationId }) => {
	try {
		const conversation = await prisma.aiConversation.findFirst({
			where: {
				userId,
				conversationKey: conversationId,
				status: { not: 'deleted' },
			},
		})

		if (!conversation) return []

		const rows = await prisma.aiMessage.findMany({
			where: {
				userId,
				conversationId: conversation.id,
				status: 'completed',
				role: { in: ['user', 'assistant'] },
			},
			orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
			take: AI_LOCAL_HISTORY_MAX_MESSAGES,
		})

		return rows.reverse()
	} catch (error) {
		if (isAiHistoryStorageUnavailable(error)) {
			aiServiceLogger.warn('[ai-context] local history storage unavailable', {
				userId: String(userId),
				conversationId,
				message: error?.message || 'Unknown DB error',
				code: error?.code || null,
			})
			return []
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

const removeStoredContextFile = async ({ userId, conversationId, fileName }) => {
	const normalizedFileName = normalizeAiMessageContent(fileName)

	if (!normalizedFileName) {
		throw new AppError('Missing required fields: fileName', 400, {
			code: 'AI_FILE_NAME_REQUIRED',
		})
	}

	try {
		const conversation = await prisma.aiConversation.findFirst({
			where: {
				userId,
				conversationKey: conversationId,
				status: { not: 'deleted' },
			},
		})

		if (!conversation) {
			return {
				status: 'ok',
				user_id: String(userId),
				conversation_id: conversationId,
				filename: normalizedFileName,
				removed: false,
				removed_count: 0,
			}
		}

		const rows = await prisma.aiMessage.findMany({
			where: {
				userId,
				conversationId: conversation.id,
			},
			select: {
				id: true,
				metadataJson: true,
			},
		})

		const idsToDelete = rows
			.filter(row => {
				const metadata = row.metadataJson && typeof row.metadataJson === 'object' ? row.metadataJson : null
				if (!metadata) return false

				return metadata.kind === 'file_upload' && String(metadata.filename || '').trim() === normalizedFileName
			})
			.map(row => row.id)

		if (idsToDelete.length > 0) {
			await prisma.aiMessage.deleteMany({
				where: {
					id: { in: idsToDelete },
					userId,
					conversationId: conversation.id,
				},
			})

			await prisma.aiConversation.update({
				where: { id: conversation.id },
				data: {
					messageCount: {
						decrement: idsToDelete.length,
					},
					lastMessageAt: new Date(),
				},
			})
		}

		return {
			status: 'ok',
			user_id: String(userId),
			conversation_id: conversationId,
			filename: normalizedFileName,
			removed: idsToDelete.length > 0,
			removed_count: idsToDelete.length,
		}
	} catch (error) {
		if (isAiHistoryStorageUnavailable(error)) {
			return {
				status: 'ok',
				user_id: String(userId),
				conversation_id: conversationId,
				filename: normalizedFileName,
				removed: false,
				removed_count: 0,
				localStorageUnavailable: true,
			}
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

	async sendChat({ userId, conversationId, message, sessionContext = '', selectedFiles, mode = 'context' }) {
		const access = await assertSubscriptionActive(userId)
		assertCapability(access, 'chat')
		assertRemaining(access, 'chat')

		const chatMode = normalizeAiChatMode(mode)
		const resolvedConversationId = resolveConversationKey({ userId, conversationId, mode: chatMode })
		const normalizedUserMessage = normalizeAiMessageContent(message)
		const normalizedSessionContext =
			chatMode === 'context' ? normalizeAiBlock(sessionContext, AI_SESSION_CONTEXT_MAX_LENGTH) : ''
		const hasSelectedFileFilter = Array.isArray(selectedFiles)
		const normalizedSelectedFiles = normalizeSelectedContextFiles(selectedFiles)
		const outboundMessage = buildAiChatOutboundMessage({
			message: normalizedUserMessage,
			sessionContext: normalizedSessionContext,
			selectedFiles: normalizedSelectedFiles,
			hasSelectedFileFilter,
		})
		const { externalUserId, vkUserId } = await resolveExternalVkUserId(userId)
		const externalConversationId = resolveExternalVkConversationId({
			externalUserId,
			conversationId: resolvedConversationId,
		})
		const idempotencyKey = buildAiChatIdempotencyKey({
			externalUserId,
			conversationId: externalConversationId,
		})

		aiServiceLogger.debug('Dispatching AI chat to external backend', {
			externalEndpoint: '/v1/chat/messages',
			localConversationId: resolvedConversationId,
			expectedExternalConversationId: externalConversationId,
			messageLength: normalizedUserMessage.length,
			outboundMessageLength: outboundMessage.length,
			sessionContextLength: normalizedSessionContext.length,
			selectedFilesCount: normalizedSelectedFiles.length,
			hasSelectedFileFilter,
			mode: chatMode,
		})

		const conversation = await ensureAiConversation({
			userId,
			conversationKey: resolvedConversationId,
			mode: chatMode,
			title: normalizedUserMessage,
		})

		await persistAiMessage({
			userId,
			conversationId: resolvedConversationId,
			role: 'user',
			content: normalizedUserMessage,
			mode: chatMode,
			conversation,
		})

		let response

		try {
			response = await aiClient.chat({
				externalUserId,
				userId: externalUserId,
				conversationId: externalConversationId,
				message: outboundMessage,
				aiProfileId: env.vkAiProfileId,
				billingMode: env.vkAiBillingMode,
				metadata: {
					local_user_id: String(userId),
					local_conversation_id: resolvedConversationId,
					mode: chatMode,
					selected_context_files: normalizedSelectedFiles,
					selected_context_files_count: normalizedSelectedFiles.length,
					has_selected_file_filter: hasSelectedFileFilter,
					vk_user_id: vkUserId,
					auth_provider: vkUserId ? 'vk' : 'internal',
				},
				idempotencyKey,
			})

			aiServiceLogger.debug('AI chat response received from external backend', {
				localConversationId: resolvedConversationId,
				externalConversationId: response?.conversation_id || externalConversationId,
				hasReply: Boolean(response?.reply),
				replyLength: String(response?.reply || '').length,
				externalMessageCount: response?.message_count ?? null,
			})
		} catch (error) {
			aiServiceLogger.error('AI chat request failed', {
				localConversationId: resolvedConversationId,
				expectedExternalConversationId: externalConversationId,
				message: error?.message || 'AI request failed',
				code: error?.details?.code || error?.code || null,
				upstreamStatus: error?.details?.upstreamStatus || null,
			})

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
					localConversationId: resolvedConversationId,
					expectedExternalConversationId: externalConversationId,
				},
			})
			throw error
		}

		const responseConversationId = response?.conversation_id || externalConversationId

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
				localConversationId: resolvedConversationId,
				externalConversationId: responseConversationId,
				selected_context_files: normalizedSelectedFiles,
				has_selected_file_filter: hasSelectedFileFilter,
				promptMode:
					normalizedSessionContext || hasSelectedFileFilter ? 'message-with-local-instructions' : 'plain-user-message',
			},
		})

		await createUsageEvent({
			userId,
			subscription: access.activeSubscription,
			modelName: USAGE_MODELS.chat,
		})

		aiServiceLogger.debug('AI chat completed', {
			localConversationId: resolvedConversationId,
			externalConversationId: responseConversationId,
			savedToLocalDb: true,
		})

		return {
			...response,
			user_id: response?.user_id || externalUserId,
			conversation_id: responseConversationId,
			local_conversation_id: resolvedConversationId,
		}
	},

	async uploadFile({ userId, conversationId, file }) {
		const access = await assertSubscriptionActive(userId)
		assertCapability(access, 'fileUpload')
		assertRemaining(access, 'fileUpload')
		assertContextFileAllowed(file)

		const resolvedConversationId = resolveConversationKey({ userId, conversationId, mode: 'context' })
		const { externalUserId, vkUserId } = await resolveExternalVkUserId(userId)
		const externalConversationId = resolveExternalVkConversationId({
			externalUserId,
			conversationId: resolvedConversationId,
		})
		const externalResponse = await aiClient.uploadFile({
			userId: externalUserId,
			conversationId: externalConversationId,
			file,
		})

		const conversation = await ensureAiConversation({
			userId,
			conversationKey: resolvedConversationId,
			mode: 'context',
			title: file?.name || 'upload',
		})

		const responseConversationId = externalResponse?.conversation_id || externalConversationId
		const response = externalResponse

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
				localConversationId: resolvedConversationId,
				externalConversationId: responseConversationId,
			},
		})

		await createUsageEvent({
			userId,
			subscription: access.activeSubscription,
			modelName: USAGE_MODELS.fileUpload,
		})

		return {
			...response,
			user_id: response?.user_id || externalUserId,
			conversation_id: responseConversationId,
			local_conversation_id: resolvedConversationId,
			filename: response?.filename || file?.name || null,
		}
	},

	async sendVoice({ userId, conversationId, file }) {
		const access = await assertSubscriptionActive(userId)
		assertCapability(access, 'voice')
		assertRemaining(access, 'voice')
		assertVoiceFileAllowed(file)

		const resolvedConversationId = resolveConversationKey({ userId, conversationId, mode: 'context' })
		const { externalUserId, vkUserId } = await resolveExternalVkUserId(userId)
		const externalConversationId = resolveExternalVkConversationId({
			externalUserId,
			conversationId: resolvedConversationId,
		})
		const externalResponse = await aiClient.voice({
			userId: externalUserId,
			conversationId: externalConversationId,
			file,
		})

		const conversation = await ensureAiConversation({
			userId,
			conversationKey: resolvedConversationId,
			mode: 'context',
			title: file?.name || 'voice',
		})

		const responseConversationId = externalResponse?.conversation_id || externalConversationId
		const response = externalResponse

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
				localConversationId: resolvedConversationId,
				externalConversationId: responseConversationId,
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
				localConversationId: resolvedConversationId,
				externalConversationId: responseConversationId,
			},
		})

		await createUsageEvent({
			userId,
			subscription: access.activeSubscription,
			modelName: USAGE_MODELS.voice,
		})

		return {
			...response,
			user_id: response?.user_id || externalUserId,
			conversation_id: responseConversationId,
			local_conversation_id: resolvedConversationId,
		}
	},

	async listConversations({ userId }) {
		const access = await assertSubscriptionActive(userId)
		assertCapability(access, 'chat')
		throw new AppError('AI conversation list is not supported by external backend contract', 501, {
			code: 'AI_CONVERSATION_LIST_UNSUPPORTED',
		})

		const conversations = await listStoredConversations({ userId })

		if (conversations === AI_HISTORY_STORAGE_UNAVAILABLE) {
			return []
		}

		return conversations
	},

	async getConversation({ userId, conversationId }) {
		const access = await assertSubscriptionActive(userId)
		assertCapability(access, 'chat')

		const resolvedConversationId = resolveConversationKey({
			userId,
			conversationId,
			mode: 'context',
		})

		console.log('[ai-context] getConversation:local_only_start', {
			userId: String(userId),
			conversationId: resolvedConversationId,
		})

		const storedConversation = await loadStoredConversation({
			userId,
			conversationId: resolvedConversationId,
		})

		if (storedConversation !== AI_HISTORY_STORAGE_UNAVAILABLE) {
			console.log('[ai-context] getConversation:local_db', {
				userId: String(userId),
				conversationId: resolvedConversationId,
				messageCount: storedConversation.message_count,
			})

			return storedConversation
		}

		console.warn('[ai-context] getConversation:local_storage_unavailable_return_empty', {
			userId: String(userId),
			conversationId: resolvedConversationId,
		})

		return serializeStoredConversation({
			userId,
			conversationId: resolvedConversationId,
			rows: [],
		})
	},

	async resetConversation({ userId, conversationId }) {
		await assertSubscriptionActive(userId)

		const resolvedConversationId = resolveConversationKey({
			userId,
			conversationId,
			mode: 'context',
		})

		console.log('[ai-context] resetConversation:local_only_start', {
			userId: String(userId),
			conversationId: resolvedConversationId,
		})

		const deletedConversation = await deleteStoredConversation({
			userId,
			conversationId: resolvedConversationId,
		})

		if (deletedConversation !== AI_HISTORY_STORAGE_UNAVAILABLE) {
			console.log('[ai-context] resetConversation:local_only_done', {
				userId: String(userId),
				conversationId: resolvedConversationId,
			})

			return {
				status: 'ok',
				user_id: String(userId),
				conversation_id: resolvedConversationId,
				localOnly: true,
			}
		}

		console.warn('[ai-context] resetConversation:local_storage_unavailable', {
			userId: String(userId),
			conversationId: resolvedConversationId,
		})

		return {
			status: 'ok',
			user_id: String(userId),
			conversation_id: resolvedConversationId,
			localOnly: true,
			localResetSkipped: true,
		}
	},

	async removeContextFile({ userId, conversationId, fileName }) {
		await assertSubscriptionActive(userId)

		const resolvedConversationId = resolveConversationKey({
			userId,
			conversationId,
			mode: 'context',
		})

		return removeStoredContextFile({
			userId,
			conversationId: resolvedConversationId,
			fileName,
		})
	},
}
