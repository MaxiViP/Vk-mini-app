export const DISCOUNT_APPLICATION_TYPES = {
	SUBSCRIPTION_PURCHASE: 'subscription_purchase',
	WALLET_TOPUP: 'wallet_topup',
}

export const DISCOUNT_TYPES = {
	PERCENT: 'percent',
	FIXED_MINOR: 'fixed_minor',
	TOPUP_BONUS_PERCENT: 'topup_bonus_percent',
	TOPUP_BONUS_FIXED_MINOR: 'topup_bonus_fixed_minor',
}

export const normalizePromoCode = value => {
	const normalized = String(value || '')
		.trim()
		.toUpperCase()

	return normalized || null
}

export const serializeAppliedDiscount = discount =>
	discount
		? {
				id: discount.id,
				code: discount.code || null,
				name: discount.name,
				description: discount.description || null,
				type: discount.discountType,
				value: discount.value,
				isAutomatic: Boolean(discount.isAutomatic),
				productType: discount.productType || null,
				planCode: discount.planCode || null,
				allowStacking: Boolean(discount.allowStacking),
			}
		: null

export const supportsDiscountApplicationType = (discountType, applicationType) => {
	if (applicationType === DISCOUNT_APPLICATION_TYPES.SUBSCRIPTION_PURCHASE) {
		return discountType === DISCOUNT_TYPES.PERCENT || discountType === DISCOUNT_TYPES.FIXED_MINOR
	}

	if (applicationType === DISCOUNT_APPLICATION_TYPES.WALLET_TOPUP) {
		return (
			discountType === DISCOUNT_TYPES.TOPUP_BONUS_PERCENT || discountType === DISCOUNT_TYPES.TOPUP_BONUS_FIXED_MINOR
		)
	}

	return false
}

export const calculateBenefitMinor = ({ discountType, value, baseAmountMinor }) => {
	const safeBase = Math.max(Number(baseAmountMinor || 0), 0)
	const safeValue = Math.max(Number(value || 0), 0)

	if (discountType === DISCOUNT_TYPES.PERCENT || discountType === DISCOUNT_TYPES.TOPUP_BONUS_PERCENT) {
		return Math.max(Math.floor((safeBase * safeValue) / 100), 0)
	}

	if (discountType === DISCOUNT_TYPES.FIXED_MINOR || discountType === DISCOUNT_TYPES.TOPUP_BONUS_FIXED_MINOR) {
		return safeValue
	}

	return 0
}

export const buildDiscountApplication = ({ discount, applicationType, baseAmountMinor }) => {
	if (!discount) {
		return {
			baseAmountMinor,
			discountAmountMinor: 0,
			finalAmountMinor: Math.max(Number(baseAmountMinor || 0), 0),
			bonusMinor: 0,
			creditedAmountMinor: Math.max(Number(baseAmountMinor || 0), 0),
			appliedDiscount: null,
		}
	}

	const rawBenefitMinor = calculateBenefitMinor({
		discountType: discount.discountType,
		value: discount.value,
		baseAmountMinor,
	})

	if (applicationType === DISCOUNT_APPLICATION_TYPES.WALLET_TOPUP) {
		const bonusMinor = Math.max(rawBenefitMinor, 0)
		const creditedAmountMinor = Math.max(Number(baseAmountMinor || 0) + bonusMinor, 0)

		return {
			baseAmountMinor,
			discountAmountMinor: bonusMinor,
			finalAmountMinor: creditedAmountMinor,
			bonusMinor,
			creditedAmountMinor,
			appliedDiscount: serializeAppliedDiscount(discount),
		}
	}

	const discountAmountMinor = Math.min(Math.max(rawBenefitMinor, 0), Math.max(Number(baseAmountMinor || 0), 0))
	const finalAmountMinor = Math.max(Number(baseAmountMinor || 0) - discountAmountMinor, 0)

	return {
		baseAmountMinor,
		discountAmountMinor,
		finalAmountMinor,
		bonusMinor: 0,
		creditedAmountMinor: finalAmountMinor,
		appliedDiscount: serializeAppliedDiscount(discount),
	}
}

export const pickBestDiscountApplication = applications => {
	if (!Array.isArray(applications) || !applications.length) return null

	return [...applications].sort((left, right) => {
		const benefitDiff = Number(right.discountAmountMinor || 0) - Number(left.discountAmountMinor || 0)
		if (benefitDiff !== 0) return benefitDiff

		const promoPriority = Number(Boolean(left.appliedDiscount?.isAutomatic)) - Number(Boolean(right.appliedDiscount?.isAutomatic))
		if (promoPriority !== 0) return promoPriority

		return String(left.appliedDiscount?.code || '').localeCompare(String(right.appliedDiscount?.code || ''))
	})[0]
}

export const buildSubscriptionPreviewPayload = ({ application, message = null }) => ({
	basePriceMinor: application.baseAmountMinor,
	discountMinor: application.discountAmountMinor,
	finalPriceMinor: application.finalAmountMinor,
	appliedDiscount: application.appliedDiscount,
	message,
})

export const buildTopupPreviewPayload = ({ application, message = null }) => ({
	baseAmountMinor: application.baseAmountMinor,
	bonusMinor: application.bonusMinor,
	creditedAmountMinor: application.creditedAmountMinor,
	appliedDiscount: application.appliedDiscount,
	message,
})
