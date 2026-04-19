import prisma from '../../db/prisma.js'
import { AppError } from '../../shared/errors.js'
import {
	DISCOUNT_APPLICATION_TYPES,
	buildDiscountApplication,
	buildSubscriptionPreviewPayload,
	buildTopupPreviewPayload,
	normalizePromoCode,
	pickBestDiscountApplication,
	serializeAppliedDiscount,
	supportsDiscountApplicationType,
} from './discount.rules.js'

const DEMO_DISCOUNTS = [
	{
		code: 'SPRING20',
		name: 'Spring 20%',
		description: '20% discount for monthly premium core subscription',
		discountType: 'percent',
		value: 20,
		productType: 'core',
		planCode: 'monthly-premium',
		isActive: true,
		isAutomatic: false,
	},
	{
		code: 'AIWELCOME',
		name: 'AI Welcome',
		description: 'Fixed discount for AI Start plan',
		discountType: 'fixed_minor',
		value: 10000,
		productType: 'ai',
		planCode: 'ai-start',
		isActive: true,
		isAutomatic: false,
	},
	{
		code: 'TOPUP10',
		name: 'Top Up 10%',
		description: '10% bonus on wallet top up',
		discountType: 'topup_bonus_percent',
		value: 10,
		isActive: true,
		isAutomatic: false,
	},
	{
		code: 'FIRST50',
		name: 'First Purchase 50',
		description: '50 RUB discount for first paid purchase',
		discountType: 'fixed_minor',
		value: 5000,
		isActive: true,
		isAutomatic: false,
		firstPurchaseOnly: true,
	},
	{
		code: 'AUTO_AI_15',
		name: 'AI Auto 15%',
		description: 'Automatic 15% discount for AI subscriptions',
		discountType: 'percent',
		value: 15,
		productType: 'ai',
		isActive: true,
		isAutomatic: true,
	},
]

const nowWithinWindow = (discount, now) => {
	if (discount.startsAt && new Date(discount.startsAt) > now) {
		return { valid: false, reason: 'not_started', message: 'Promo code is not active yet.' }
	}

	if (discount.endsAt && new Date(discount.endsAt) < now) {
		return { valid: false, reason: 'expired', message: 'Promo code has expired.' }
	}

	return { valid: true }
}

const buildPromoError = validation =>
	new AppError(validation.message || 'Promo code is not valid for this operation.', 400, {
		code: 'DISCOUNT_NOT_APPLICABLE',
		reason: validation.reason || 'invalid',
	})

const matchesTarget = (discount, { productType, planCode, userId }) => {
	if (discount.targetUserId && discount.targetUserId !== userId) {
		return { valid: false, reason: 'wrong_user', message: 'Promo code is not available for this user.' }
	}

	if (discount.productType && discount.productType !== productType) {
		return { valid: false, reason: 'wrong_product_type', message: 'Promo code is not valid for this product.' }
	}

	if (discount.planCode && discount.planCode !== planCode) {
		return { valid: false, reason: 'wrong_plan', message: 'Promo code is not valid for this plan.' }
	}

	return { valid: true }
}

const getDiscountUsageSnapshot = async ({ db, discountId, userId }) => {
	const [globalUses, userUses] = await Promise.all([
		db.discountRedemption.count({ where: { discountId } }),
		db.discountRedemption.count({ where: { discountId, userId } }),
	])

	return { globalUses, userUses }
}

const hasUserPriorPaidTransactions = async ({ db, userId }) => {
	const [successfulPayments, subscriptionPurchases] = await Promise.all([
		db.payment.count({ where: { userId, status: 'succeeded' } }),
		db.walletLedger.count({ where: { userId, reason: 'subscription_purchase' } }),
	])

	return successfulPayments + subscriptionPurchases > 0
}

const validateDiscount = async ({ db, discount, context, now, priorPurchaseKnown }) => {
	if (!discount.isActive) {
		return { valid: false, reason: 'inactive', message: 'Promo code is inactive.' }
	}

	if (!supportsDiscountApplicationType(discount.discountType, context.applicationType)) {
		return { valid: false, reason: 'wrong_application_type', message: 'Promo code cannot be used here.' }
	}

	const windowValidation = nowWithinWindow(discount, now)
	if (!windowValidation.valid) return windowValidation

	const targetValidation = matchesTarget(discount, context)
	if (!targetValidation.valid) return targetValidation

	const usageSnapshot = await getDiscountUsageSnapshot({
		db,
		discountId: discount.id,
		userId: context.userId,
	})

	if (discount.maxUses !== null && discount.maxUses !== undefined && usageSnapshot.globalUses >= discount.maxUses) {
		return { valid: false, reason: 'max_uses_reached', message: 'Promo code usage limit has been reached.' }
	}

	if (
		discount.maxUsesPerUser !== null &&
		discount.maxUsesPerUser !== undefined &&
		usageSnapshot.userUses >= discount.maxUsesPerUser
	) {
		return { valid: false, reason: 'max_uses_per_user_reached', message: 'Promo code already used by this user.' }
	}

	if (discount.firstPurchaseOnly && priorPurchaseKnown) {
		return {
			valid: false,
			reason: 'first_purchase_only',
			message: 'Promo code is available only for the first paid purchase.',
		}
	}

	return { valid: true }
}

const loadAutomaticDiscounts = ({ db }) =>
	db.discount.findMany({
		where: { isAutomatic: true, isActive: true },
		orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
	})

const loadPromoDiscount = async ({ db, promoCode }) => {
	const normalizedPromoCode = normalizePromoCode(promoCode)
	if (!normalizedPromoCode) return null

	const discount = await db.discount.findUnique({
		where: { code: normalizedPromoCode },
	})

	if (!discount) {
		throw new AppError('Promo code was not found.', 400, {
			code: 'DISCOUNT_CODE_INVALID',
			reason: 'not_found',
		})
	}

	return discount
}

const buildResolutionMessage = ({ promoDiscount, selectedDiscount, promoCode }) => {
	if (!selectedDiscount) return null

	if (promoCode && promoDiscount && selectedDiscount.id !== promoDiscount.id && selectedDiscount.isAutomatic) {
		return `Automatic discount "${selectedDiscount.name}" was applied because it is more beneficial than promo code ${normalizePromoCode(promoCode)}.`
	}

	if (selectedDiscount.isAutomatic) {
		return `Automatic discount "${selectedDiscount.name}" was applied.`
	}

	if (selectedDiscount.code) {
		return `Promo code ${selectedDiscount.code} applied.`
	}

	return `Discount "${selectedDiscount.name}" applied.`
}

const resolveBestDiscount = async ({
	db = prisma,
	userId,
	applicationType,
	baseAmountMinor,
	productType = null,
	planCode = null,
	promoCode = null,
}) => {
	const now = new Date()
	const promoDiscount = await loadPromoDiscount({ db, promoCode })
	const automaticDiscounts = await loadAutomaticDiscounts({ db })
	const candidateDiscounts = [...automaticDiscounts]

	if (promoDiscount && !candidateDiscounts.some(discount => discount.id === promoDiscount.id)) {
		candidateDiscounts.push(promoDiscount)
	}

	const requiresFirstPurchaseCheck = candidateDiscounts.some(discount => discount.firstPurchaseOnly)
	const priorPurchaseKnown = requiresFirstPurchaseCheck ? await hasUserPriorPaidTransactions({ db, userId }) : false
	const context = {
		userId,
		applicationType,
		productType,
		planCode,
		baseAmountMinor,
	}

	if (promoDiscount) {
		const promoValidation = await validateDiscount({
			db,
			discount: promoDiscount,
			context,
			now,
			priorPurchaseKnown,
		})

		if (!promoValidation.valid) {
			throw buildPromoError(promoValidation)
		}
	}

	const applications = []

	for (const discount of candidateDiscounts) {
		const validation = await validateDiscount({
			db,
			discount,
			context,
			now,
			priorPurchaseKnown,
		})

		if (!validation.valid) continue

		const application = buildDiscountApplication({
			discount,
			applicationType,
			baseAmountMinor,
		})

		if (application.discountAmountMinor <= 0) continue

		applications.push(application)
	}

	const bestApplication = pickBestDiscountApplication(applications)
	const fallbackApplication = buildDiscountApplication({
		discount: null,
		applicationType,
		baseAmountMinor,
	})

	return {
		application: bestApplication || fallbackApplication,
		selectedDiscount: bestApplication
			? candidateDiscounts.find(discount => discount.id === bestApplication.appliedDiscount?.id) || null
			: null,
		promoDiscount,
		message: buildResolutionMessage({
			promoDiscount,
			selectedDiscount: bestApplication
				? candidateDiscounts.find(discount => discount.id === bestApplication.appliedDiscount?.id) || null
				: null,
			promoCode,
		}),
	}
}

const createDiscountRedemption = async ({
	db = prisma,
	discountId,
	userId,
	paymentId = null,
	subscriptionId = null,
	promoCodeSnapshot = null,
	baseAmountMinor,
	discountAmountMinor,
	finalAmountMinor,
	applicationType,
}) => {
	if (!discountId || discountAmountMinor <= 0) return null

	return db.discountRedemption.create({
		data: {
			discountId,
			userId,
			paymentId,
			subscriptionId,
			promoCodeSnapshot: normalizePromoCode(promoCodeSnapshot),
			baseAmountMinor,
			discountAmountMinor,
			finalAmountMinor,
			applicationType,
		},
	})
}

const getAutomaticDiscountsSummary = async ({ db = prisma, productType = null }) => {
	const discounts = await db.discount.findMany({
		where: {
			isAutomatic: true,
			isActive: true,
			...(productType ? { OR: [{ productType: null }, { productType }] } : {}),
		},
		orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
	})

	return discounts.map(serializeAppliedDiscount)
}

const getRecentDiscountRedemptions = async ({ db = prisma, userId, limit = 10 }) => {
	const rows = await db.discountRedemption.findMany({
		where: { userId },
		include: { discount: true },
		orderBy: { createdAt: 'desc' },
		take: Math.min(Number(limit) || 10, 50),
	})

	return rows.map(row => ({
		id: row.id,
		applicationType: row.applicationType,
		promoCodeSnapshot: row.promoCodeSnapshot || null,
		baseAmountMinor: row.baseAmountMinor,
		discountAmountMinor: row.discountAmountMinor,
		finalAmountMinor: row.finalAmountMinor,
		createdAt: row.createdAt,
		discount: serializeAppliedDiscount(row.discount),
	}))
}

const seedDemoDiscounts = async ({ db = prisma }) => {
	await Promise.all(
		DEMO_DISCOUNTS.map(discount =>
			db.discount.upsert({
				where: { code: discount.code },
				update: discount,
				create: discount,
			}),
		),
	)
}

export const discountService = {
	DISCOUNT_APPLICATION_TYPES,
	normalizePromoCode,

	async ensureDiscountSeeded({ db = prisma } = {}) {
		await seedDemoDiscounts({ db })
	},

	async previewSubscriptionPurchase({ db = prisma, userId, productType, planCode, basePriceMinor, promoCode }) {
		const resolved = await resolveBestDiscount({
			db,
			userId,
			applicationType: DISCOUNT_APPLICATION_TYPES.SUBSCRIPTION_PURCHASE,
			baseAmountMinor: basePriceMinor,
			productType,
			planCode,
			promoCode,
		})

		return {
			...buildSubscriptionPreviewPayload({
				application: resolved.application,
				message: resolved.message,
			}),
			selectedDiscountId: resolved.selectedDiscount?.id || null,
			promoCodeSnapshot: normalizePromoCode(promoCode),
		}
	},

	async previewWalletTopup({ db = prisma, userId, baseAmountMinor, promoCode }) {
		const resolved = await resolveBestDiscount({
			db,
			userId,
			applicationType: DISCOUNT_APPLICATION_TYPES.WALLET_TOPUP,
			baseAmountMinor,
			promoCode,
		})

		return {
			...buildTopupPreviewPayload({
				application: resolved.application,
				message: resolved.message,
			}),
			selectedDiscountId: resolved.selectedDiscount?.id || null,
			promoCodeSnapshot: normalizePromoCode(promoCode),
		}
	},

	async createDiscountRedemption(params) {
		return createDiscountRedemption(params)
	},

	async getAutomaticDiscountsSummary(params) {
		return getAutomaticDiscountsSummary(params)
	},

	async getRecentDiscountRedemptions(params) {
		return getRecentDiscountRedemptions(params)
	},
}
