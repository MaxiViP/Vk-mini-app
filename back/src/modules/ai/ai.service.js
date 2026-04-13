import crypto from 'node:crypto'

import prisma from '../../db/prisma.js'
import { AppError } from '../../shared/errors.js'
import { ensurePlanCatalogSeeded, expireElapsedSubscriptions, getActiveSubscriptionWithPlan } from '../billing/billing.service.js'
import { aiClient } from './ai.client.js'

const AI_PRODUCT_TYPE = 'ai'
const AI_PROVIDER = 'vk_ai'

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

const toExternalUserId = userId => String(userId)

export const aiService = {
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

	async sendChat({ userId, conversationId, message }) {
		const access = await assertSubscriptionActive(userId)
		assertCapability(access, 'chat')
		assertRemaining(access, 'chat')

		const response = await aiClient.chat({
			userId: toExternalUserId(userId),
			conversationId,
			message,
		})

		await createUsageEvent({
			userId,
			subscription: access.activeSubscription,
			modelName: USAGE_MODELS.chat,
		})

		// Временное ограничение: audio_reply_url пробрасывается как есть, media-proxy на этом шаге не реализован.
		return response
	},

	async uploadFile({ userId, conversationId, file }) {
		const access = await assertSubscriptionActive(userId)
		assertCapability(access, 'fileUpload')
		assertRemaining(access, 'fileUpload')

		const response = await aiClient.uploadFile({
			userId: toExternalUserId(userId),
			conversationId,
			file,
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

		const response = await aiClient.voice({
			userId: toExternalUserId(userId),
			conversationId,
			file,
		})

		await createUsageEvent({
			userId,
			subscription: access.activeSubscription,
			modelName: USAGE_MODELS.voice,
		})

		// Временное ограничение: audio_reply_url пробрасывается как есть, media-proxy на этом шаге не реализован.
		return response
	},

	async getConversation({ userId, conversationId }) {
		const access = await assertSubscriptionActive(userId)
		assertCapability(access, 'chat')

		return aiClient.getConversation({
			userId: toExternalUserId(userId),
			conversationId,
		})
	},

	async resetConversation({ userId, conversationId }) {
		await assertSubscriptionActive(userId)

		return aiClient.resetConversation({
			userId: toExternalUserId(userId),
			conversationId,
		})
	},
}
