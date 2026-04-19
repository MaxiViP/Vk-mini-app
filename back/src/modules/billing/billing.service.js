import crypto from 'node:crypto'

import prisma from '../../db/prisma.js'
import { isLegacyBillingSchemaError, prismaCompat } from '../../db/prisma-compat.js'
import { AppError } from '../../shared/errors.js'
import { logBusinessEvent } from '../../shared/observability.js'
import { isAdminUser } from '../../shared/access.js'
import { ALL_PLAN_CATALOG, PLAN_CATALOG, PAYG_PRICING_MINOR, formatMoneyMinor } from './billing.catalog.js'
import { discountService } from './discount.service.js'

const DEFAULT_CURRENCY = 'RUB'

const toMinor = amount => {
	const numeric = Number(amount)
	if (!Number.isFinite(numeric) || numeric <= 0) throw new AppError('amount must be a positive number', 400)
	return Math.round(numeric * 100)
}

const addDays = (date, days) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000)

const createStubQrCode = payload =>
	'data:image/svg+xml;charset=UTF-8,' +
	encodeURIComponent(
		`<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220"><rect width="220" height="220" fill="white"/><rect x="10" y="10" width="200" height="200" fill="none" stroke="black" stroke-width="4"/><text x="110" y="100" text-anchor="middle" font-size="14" font-family="monospace">YOOKASSA</text><text x="110" y="124" text-anchor="middle" font-size="12" font-family="monospace">${payload}</text></svg>`,
	)

const billingV2Available = prismaCompat.hasPlanBillingFields && prismaCompat.hasSubscriptionBillingFields
const CORE_PRODUCT_TYPE = 'core'

const serializePlan = plan => ({
	id: plan.id,
	code: plan.code,
	name: plan.name,
	productType: plan.productType || CORE_PRODUCT_TYPE,
	priceMinor: plan.priceMinor,
	price: formatMoneyMinor(plan.priceMinor),
	intervalDays: plan.intervalDays,
	includedRequests: plan.includedRequests,
	accessTier: plan.accessTier,
	aiChatLimit: plan.aiChatLimit ?? null,
	aiVoiceLimit: plan.aiVoiceLimit ?? null,
	aiFileUploadLimit: plan.aiFileUploadLimit ?? null,
	isActive: plan.isActive,
})

const serializeSubscription = subscription =>
	subscription
		? {
				id: subscription.id,
				status: subscription.status,
				startedAt: subscription.periodStart,
				expiresAt: subscription.periodEnd,
				cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
				includedRequests: subscription.includedRequests,
				usedRequests: subscription.usedRequests,
				remainingRequests: Math.max(subscription.includedRequests - subscription.usedRequests, 0),
				plan: subscription.plan ? serializePlan(subscription.plan) : null,
			}
		: null

const serializeLedgerEntry = entry => ({
	id: entry.id,
	type: entry.type,
	reason: entry.reason,
	amountMinor: entry.amountMinor,
	amount: formatMoneyMinor(entry.amountMinor),
	referenceType: entry.referenceType,
	referenceId: entry.referenceId,
	createdAt: entry.createdAt,
})

const serializePayment = payment => ({
	id: payment.id,
	provider: payment.provider,
	status: payment.status,
	amountMinor: payment.amountMinor,
	amount: formatMoneyMinor(payment.amountMinor),
	creditedAmountMinor: payment.creditedAmountMinor ?? payment.amountMinor,
	creditedAmount: formatMoneyMinor(payment.creditedAmountMinor ?? payment.amountMinor),
	bonusAmountMinor: payment.bonusAmountMinor ?? 0,
	bonusAmount: formatMoneyMinor(payment.bonusAmountMinor ?? 0),
	promoCodeSnapshot: payment.promoCodeSnapshot || null,
	appliedDiscount: payment.appliedDiscountSnapshot || null,
	createdAt: payment.createdAt,
	updatedAt: payment.updatedAt,
})

const buildLegacyPlans = () =>
	PLAN_CATALOG.map(plan => ({
		id: plan.code,
		code: plan.code,
		name: plan.name,
		productType: plan.productType || CORE_PRODUCT_TYPE,
		priceMinor: plan.priceMinor,
		price: formatMoneyMinor(plan.priceMinor),
		intervalDays: plan.intervalDays,
		includedRequests: plan.includedRequests,
		accessTier: plan.accessTier,
		aiChatLimit: plan.aiChatLimit ?? null,
		aiVoiceLimit: plan.aiVoiceLimit ?? null,
		aiFileUploadLimit: plan.aiFileUploadLimit ?? null,
		isActive: true,
	}))

const getLegacySummary = async ({ userId, historyLimit = 20 }) => {
	await ensureWalletExists(prisma, userId)

	const [wallet, ledger, payments] = await Promise.all([
		prisma.wallet.findUnique({ where: { userId } }),
		prisma.walletLedger.findMany({
			where: { userId },
			take: Math.min(Number(historyLimit) || 20, 100),
			orderBy: { createdAt: 'desc' },
		}),
		prisma.payment.findMany({
			where: { userId },
			take: Math.min(Number(historyLimit) || 20, 100),
			orderBy: { createdAt: 'desc' },
		}),
	])

	return {
		wallet: {
			balanceMinor: wallet?.balanceMinor || 0,
			balance: formatMoneyMinor(wallet?.balanceMinor || 0),
			currency: wallet?.currency || DEFAULT_CURRENCY,
		},
		activeSubscription: null,
		plans: buildLegacyPlans(),
		paygPricing: {
			basicMinor: PAYG_PRICING_MINOR.basic,
			basic: formatMoneyMinor(PAYG_PRICING_MINOR.basic),
			premiumMinor: PAYG_PRICING_MINOR.premium,
			premium: formatMoneyMinor(PAYG_PRICING_MINOR.premium),
		},
		usageSnapshot: {
			remainingIncludedRequests: 0,
			mode: 'payg',
		},
		recentLedger: ledger.map(serializeLedgerEntry),
		recentPayments: payments.map(serializePayment),
		automaticDiscounts: [],
		recentDiscounts: [],
		legacyBillingMode: true,
	}
}

export const ensureWalletExists = async (db, userId) =>
	db.wallet.upsert({
		where: { userId },
		update: {},
		create: { userId, balanceMinor: 0, currency: DEFAULT_CURRENCY },
	})

export const ensurePlanCatalogSeeded = async () => {
	if (!billingV2Available) return

	await Promise.all(
		ALL_PLAN_CATALOG.map(plan =>
			prisma.plan.upsert({
				where: { code: plan.code },
				update: {
					name: plan.name,
					productType: plan.productType || CORE_PRODUCT_TYPE,
					priceMinor: plan.priceMinor,
					intervalDays: plan.intervalDays,
					includedRequests: plan.includedRequests,
					accessTier: plan.accessTier,
					aiChatLimit: plan.aiChatLimit ?? null,
					aiVoiceLimit: plan.aiVoiceLimit ?? null,
					aiFileUploadLimit: plan.aiFileUploadLimit ?? null,
					isActive: plan.isActive ?? true,
				},
				create: plan,
			}),
		),
	)

	await discountService.ensureDiscountSeeded()
}

export const expireElapsedSubscriptions = async (db, userId = null, productType = null) => {
	if (!billingV2Available) return

	const now = new Date()
	const where = {
		status: { in: ['active', 'trialing', 'past_due'] },
		periodEnd: { lt: now },
		...(userId ? { userId } : {}),
		...(productType ? { plan: { is: { productType } } } : {}),
	}

	await db.subscription.updateMany({
		where,
		data: {
			status: 'expired',
			endedAt: now,
		},
	})
}

export const getActiveSubscriptionWithPlan = async (db, userId, options = {}) =>
	!billingV2Available
		? null
		: db.subscription.findFirst({
				where: {
					userId,
					status: { in: ['active', 'trialing', 'past_due'] },
					periodEnd: { gt: new Date() },
					plan: { is: { productType: options.productType || CORE_PRODUCT_TYPE } },
				},
				orderBy: { periodEnd: 'desc' },
				include: { plan: true },
			})

export const resolveUsageBillingContext = async ({ db = prisma, userId, modelTier }) => {
	await ensureWalletExists(db, userId)
	if (!billingV2Available) {
		return {
			wallet: await db.wallet.findUnique({ where: { userId } }),
			subscription: null,
			billingSource: 'payg',
			costMinor: 0,
		}
	}

	await expireElapsedSubscriptions(db, userId, CORE_PRODUCT_TYPE)

	const [wallet, subscription] = await Promise.all([
		db.wallet.findUnique({ where: { userId } }),
		getActiveSubscriptionWithPlan(db, userId, { productType: CORE_PRODUCT_TYPE }),
	])

	const hasIncludedAccess =
		subscription &&
		subscription.plan &&
		(subscription.plan.accessTier === 'premium' || subscription.plan.accessTier === modelTier) &&
		subscription.usedRequests < subscription.includedRequests

	return {
		wallet,
		subscription,
		billingSource: hasIncludedAccess ? 'subscription_included' : 'payg',
		costMinor: hasIncludedAccess ? 0 : PAYG_PRICING_MINOR[modelTier] || PAYG_PRICING_MINOR.basic,
	}
}

const buildPaymentSession = payment => {
	const amount = formatMoneyMinor(payment.amountMinor)
	const qrPayload = `YOOKASSA-STUB:${payment.id}:${payment.amountMinor}`

	return {
		paymentId: payment.id,
		amount,
		baseAmountMinor: payment.amountMinor,
		bonusMinor: payment.bonusAmountMinor ?? 0,
		creditedAmountMinor: payment.creditedAmountMinor ?? payment.amountMinor,
		status: payment.status,
		confirmationUrl: `https://yookassa.ru/mock/${payment.id}`,
		qrCodeDataUrl: createStubQrCode(payment.id.slice(0, 12)),
		qrPayload,
		isStub: true,
		provider: 'yookassa',
		appliedDiscount: payment.appliedDiscountSnapshot || null,
	}
}

export const billingService = {
	async previewSubscriptionPurchase({ userId, planCode, promoCode }) {
		if (!billingV2Available) {
			throw new AppError('Subscription billing requires billing migration on the server', 503)
		}

		await ensurePlanCatalogSeeded()

		const plan = await prisma.plan.findUnique({ where: { code: planCode } })
		if (!plan || !plan.isActive) throw new AppError('Plan not found', 404)

		const preview = await discountService.previewSubscriptionPurchase({
			userId,
			productType: plan.productType || CORE_PRODUCT_TYPE,
			planCode: plan.code,
			basePriceMinor: plan.priceMinor,
			promoCode,
		})

		return {
			basePriceMinor: preview.basePriceMinor,
			discountMinor: preview.discountMinor,
			finalPriceMinor: preview.finalPriceMinor,
			appliedDiscount: preview.appliedDiscount,
			message: preview.message || null,
		}
	},

	async previewYooKassaPayment({ userId, amount, promoCode }) {
		await ensurePlanCatalogSeeded()

		const preview = await discountService.previewWalletTopup({
			userId,
			baseAmountMinor: toMinor(amount),
			promoCode,
		})

		return {
			baseAmountMinor: preview.baseAmountMinor,
			bonusMinor: preview.bonusMinor,
			creditedAmountMinor: preview.creditedAmountMinor,
			appliedDiscount: preview.appliedDiscount,
			message: preview.message || null,
		}
	},

	async applySuccessfulPayment(payment) {
		if (!payment) throw new AppError('Payment not found', 404)

		await prisma.$transaction(async tx => {
			const currentPayment = await tx.payment.findUnique({ where: { id: payment.id } })
			if (!currentPayment) throw new AppError('Payment not found', 404)

			if (currentPayment.status !== 'succeeded') {
				await tx.payment.update({
					where: { id: currentPayment.id },
					data: { status: 'succeeded' },
				})
			}

			const ledgerKey = `payment_success_${currentPayment.id}`
			const existingLedger = await tx.walletLedger.findUnique({ where: { idempotencyKey: ledgerKey } })
			const existingRedemption = currentPayment.appliedDiscountId
				? await tx.discountRedemption.findFirst({ where: { paymentId: currentPayment.id } })
				: null
			if (existingLedger) {
				if (
					currentPayment.appliedDiscountId &&
					!existingRedemption &&
					Number(currentPayment.bonusAmountMinor || 0) > 0
				) {
					await discountService.createDiscountRedemption({
						db: tx,
						discountId: currentPayment.appliedDiscountId,
						userId: currentPayment.userId,
						paymentId: currentPayment.id,
						promoCodeSnapshot: currentPayment.promoCodeSnapshot,
						baseAmountMinor: currentPayment.amountMinor,
						discountAmountMinor: currentPayment.bonusAmountMinor || 0,
						finalAmountMinor: currentPayment.creditedAmountMinor || currentPayment.amountMinor,
						applicationType: discountService.DISCOUNT_APPLICATION_TYPES.WALLET_TOPUP,
					})
				}

				return
			}

			const creditedAmountMinor = currentPayment.creditedAmountMinor || currentPayment.amountMinor

			await ensureWalletExists(tx, currentPayment.userId)
			await tx.wallet.update({
				where: { userId: currentPayment.userId },
				data: { balanceMinor: { increment: creditedAmountMinor } },
			})
			await tx.walletLedger.create({
				data: {
					userId: currentPayment.userId,
					type: 'credit',
					amountMinor: creditedAmountMinor,
					reason: 'payment_topup',
					referenceType: 'payment',
					referenceId: currentPayment.id,
					idempotencyKey: ledgerKey,
				},
			})

			if (currentPayment.appliedDiscountId && Number(currentPayment.bonusAmountMinor || 0) > 0 && !existingRedemption) {
				await discountService.createDiscountRedemption({
					db: tx,
					discountId: currentPayment.appliedDiscountId,
					userId: currentPayment.userId,
					paymentId: currentPayment.id,
					promoCodeSnapshot: currentPayment.promoCodeSnapshot,
					baseAmountMinor: currentPayment.amountMinor,
					discountAmountMinor: currentPayment.bonusAmountMinor || 0,
					finalAmountMinor: creditedAmountMinor,
					applicationType: discountService.DISCOUNT_APPLICATION_TYPES.WALLET_TOPUP,
				})
			}
		})

		await logBusinessEvent({
			eventType: 'balance.changed',
			actorUserId: payment.userId,
			entityType: 'wallet',
			entityId: payment.userId,
			payload: {
				deltaMinor: payment.creditedAmountMinor || payment.amountMinor,
				reason: 'payment_topup',
				bonusAmountMinor: payment.bonusAmountMinor || 0,
				appliedDiscount: payment.appliedDiscountSnapshot || null,
			},
		})
	},

	async createYooKassaPayment({ userId, amount, returnUrl, idempotencyKey, promoCode }) {
		const amountMinor = toMinor(amount)
		const safeIdempotencyKey = idempotencyKey || crypto.randomUUID()

		const existing = await prisma.payment.findUnique({ where: { idempotencyKey: safeIdempotencyKey } })
		if (existing) {
			return buildPaymentSession(existing)
		}

		const preview = await discountService.previewWalletTopup({
			userId,
			baseAmountMinor: amountMinor,
			promoCode,
		})

		const payment = await prisma.payment.create({
			data: {
				userId,
				provider: 'yookassa',
				providerPaymentId: `yoopay_${crypto.randomUUID()}`,
				amountMinor,
				creditedAmountMinor: preview.creditedAmountMinor,
				bonusAmountMinor: preview.bonusMinor,
				promoCodeSnapshot: preview.promoCodeSnapshot,
				appliedDiscountId: preview.selectedDiscountId,
				appliedDiscountSnapshot: preview.appliedDiscount,
				status: 'pending',
				idempotencyKey: safeIdempotencyKey,
			},
		})

		await prisma.paymentEvent.create({
			data: {
				paymentId: payment.id,
				eventType: 'create',
				rawPayload: {
					returnUrl: returnUrl || null,
					mode: 'stub',
					promoCode: preview.promoCodeSnapshot,
					appliedDiscount: preview.appliedDiscount,
				},
			},
		})

		await logBusinessEvent({
			eventType: 'payment.created',
			actorUserId: userId,
			entityType: 'payment',
			entityId: payment.id,
			payload: {
				amountMinor,
				creditedAmountMinor: preview.creditedAmountMinor,
				bonusAmountMinor: preview.bonusMinor,
				idempotencyKey: safeIdempotencyKey,
				appliedDiscount: preview.appliedDiscount,
			},
		})

		return buildPaymentSession(payment)
	},

	async handleYooKassaWebhook(payload) {
		const providerPaymentId = payload?.object?.id || payload?.paymentId
		if (!providerPaymentId) throw new AppError('provider payment id is required', 400)

		const payment = await prisma.payment.findUnique({ where: { providerPaymentId } })
		if (!payment) throw new AppError('Payment not found', 404)

		const status =
			payload?.event === 'payment.succeeded'
				? 'succeeded'
				: payload?.event === 'payment.canceled'
					? 'canceled'
					: payload?.event === 'payment.waiting_for_capture'
						? 'pending'
						: 'failed'

		const updated = await prisma.payment.update({
			where: { id: payment.id },
			data: { status },
		})

		await prisma.paymentEvent.create({
			data: {
				paymentId: payment.id,
				eventType: payload?.event || 'unknown',
				rawPayload: payload,
			},
		})

		await logBusinessEvent({
			eventType: `payment.${status}`,
			actorUserId: payment.userId,
			entityType: 'payment',
			entityId: payment.id,
			payload: { providerPaymentId },
		})

		if (status === 'succeeded') {
			await this.applySuccessfulPayment(payment)
		}

		return updated
	},

	async confirmYooKassaPayment({ paymentId, actorUserId }) {
		const payment = await prisma.payment.findUnique({ where: { id: paymentId } })
		if (!payment) throw new AppError('Payment not found', 404)
		if (payment.userId !== actorUserId && !(await isAdminUser(actorUserId))) {
			throw new AppError('Forbidden', 403)
		}

		await prisma.paymentEvent.create({
			data: {
				paymentId: payment.id,
				eventType: 'manual_confirm',
				rawPayload: { actorUserId, mode: 'stub' },
			},
		})

		await this.applySuccessfulPayment(payment)

		return {
			paymentId: payment.id,
			status: 'succeeded',
			amount: formatMoneyMinor(payment.creditedAmountMinor || payment.amountMinor),
			baseAmountMinor: payment.amountMinor,
			bonusMinor: payment.bonusAmountMinor || 0,
			creditedAmountMinor: payment.creditedAmountMinor || payment.amountMinor,
			appliedDiscount: payment.appliedDiscountSnapshot || null,
			isStub: true,
		}
	},

	async purchaseSubscription({ userId, planCode, idempotencyKey, promoCode }) {
		if (!billingV2Available) {
			throw new AppError('Subscription billing requires billing migration on the server', 503)
		}

		await ensurePlanCatalogSeeded()

		const safeIdempotencyKey = idempotencyKey || crypto.randomUUID()
		const existingLedger = await prisma.walletLedger.findUnique({
			where: { idempotencyKey: `subscription_purchase_${safeIdempotencyKey}` },
		})
		if (existingLedger?.referenceId) {
			const existingSubscription = await prisma.subscription.findUnique({
				where: { id: existingLedger.referenceId },
				include: { plan: true },
			})
			if (existingSubscription) {
				const existingRedemption = await prisma.discountRedemption.findFirst({
					where: { subscriptionId: existingSubscription.id },
					include: { discount: true },
				})

				return {
					subscription: serializeSubscription(existingSubscription),
					balanceMinor: (
						await ensureWalletExists(prisma, userId).then(() => prisma.wallet.findUnique({ where: { userId } }))
					)?.balanceMinor || 0,
					basePriceMinor: existingSubscription.plan.priceMinor,
					discountMinor: existingRedemption?.discountAmountMinor || 0,
					finalPriceMinor:
						Math.max(existingSubscription.plan.priceMinor - (existingRedemption?.discountAmountMinor || 0), 0),
					appliedDiscount: existingRedemption?.discount
						? {
								id: existingRedemption.discount.id,
								code: existingRedemption.discount.code || null,
								name: existingRedemption.discount.name,
								description: existingRedemption.discount.description || null,
								type: existingRedemption.discount.discountType,
								value: existingRedemption.discount.value,
								isAutomatic: Boolean(existingRedemption.discount.isAutomatic),
								productType: existingRedemption.discount.productType || null,
								planCode: existingRedemption.discount.planCode || null,
								allowStacking: Boolean(existingRedemption.discount.allowStacking),
							}
						: null,
					idempotentReplay: true,
				}
			}
		}

		const result = await prisma.$transaction(async tx => {
			await ensureWalletExists(tx, userId)
			await expireElapsedSubscriptions(tx, userId)

			const [wallet, plan] = await Promise.all([
				tx.wallet.findUnique({ where: { userId } }),
				tx.plan.findUnique({ where: { code: planCode } }),
			])

			if (!plan || !plan.isActive) throw new AppError('Plan not found', 404)

			const preview = await discountService.previewSubscriptionPurchase({
				db: tx,
				userId,
				productType: plan.productType || CORE_PRODUCT_TYPE,
				planCode: plan.code,
				basePriceMinor: plan.priceMinor,
				promoCode,
			})

			if ((wallet?.balanceMinor || 0) < preview.finalPriceMinor) {
				throw new AppError('Insufficient balance for subscription purchase', 402)
			}

			await tx.subscription.updateMany({
				where: {
					userId,
					status: { in: ['active', 'trialing', 'past_due'] },
					plan: { is: { productType: plan.productType || CORE_PRODUCT_TYPE } },
				},
				data: {
					status: 'canceled',
					endedAt: new Date(),
				},
			})

			const periodStart = new Date()
			const periodEnd = addDays(periodStart, plan.intervalDays)

			const subscription = await tx.subscription.create({
				data: {
					userId,
					planId: plan.id,
					status: 'active',
					periodStart,
					periodEnd,
					includedRequests: plan.includedRequests,
					usedRequests: 0,
				},
				include: { plan: true },
			})

			await tx.wallet.update({
				where: { userId },
				data: { balanceMinor: { decrement: preview.finalPriceMinor } },
			})

			await tx.walletLedger.create({
				data: {
					userId,
					type: 'debit',
					amountMinor: preview.finalPriceMinor,
					reason: 'subscription_purchase',
					referenceType: 'subscription',
					referenceId: subscription.id,
					idempotencyKey: `subscription_purchase_${safeIdempotencyKey}`,
				},
			})

			if (preview.selectedDiscountId && preview.discountMinor > 0) {
				await discountService.createDiscountRedemption({
					db: tx,
					discountId: preview.selectedDiscountId,
					userId,
					subscriptionId: subscription.id,
					promoCodeSnapshot: preview.promoCodeSnapshot,
					baseAmountMinor: preview.basePriceMinor,
					discountAmountMinor: preview.discountMinor,
					finalAmountMinor: preview.finalPriceMinor,
					applicationType: discountService.DISCOUNT_APPLICATION_TYPES.SUBSCRIPTION_PURCHASE,
				})
			}

			const updatedWallet = await tx.wallet.findUnique({ where: { userId } })

			return {
				subscription,
				wallet: updatedWallet,
				preview,
			}
		})

		await logBusinessEvent({
			eventType: 'subscription.purchased',
			actorUserId: userId,
			entityType: 'subscription',
			entityId: result.subscription.id,
			payload: {
				planCode,
				basePriceMinor: result.subscription.plan.priceMinor,
				discountMinor: result.preview.discountMinor,
				finalPriceMinor: result.preview.finalPriceMinor,
				appliedDiscount: result.preview.appliedDiscount,
			},
		})
		await logBusinessEvent({
			eventType: 'balance.changed',
			actorUserId: userId,
			entityType: 'wallet',
			entityId: userId,
			payload: {
				deltaMinor: -result.preview.finalPriceMinor,
				reason: 'subscription_purchase',
				appliedDiscount: result.preview.appliedDiscount,
			},
		})

		return {
			subscription: serializeSubscription(result.subscription),
			balanceMinor: result.wallet?.balanceMinor || 0,
			basePriceMinor: result.preview.basePriceMinor,
			discountMinor: result.preview.discountMinor,
			finalPriceMinor: result.preview.finalPriceMinor,
			appliedDiscount: result.preview.appliedDiscount,
			message: result.preview.message,
			idempotentReplay: false,
		}
	},

	async getSummary({ userId, historyLimit = 20 }) {
		if (!billingV2Available) {
			return getLegacySummary({ userId, historyLimit })
		}

		try {
			await ensurePlanCatalogSeeded()
			await ensureWalletExists(prisma, userId)
			await expireElapsedSubscriptions(prisma, userId, CORE_PRODUCT_TYPE)

			const [wallet, activeSubscription, plans, ledger, payments, automaticDiscounts, recentDiscounts] = await Promise.all([
				prisma.wallet.findUnique({ where: { userId } }),
				getActiveSubscriptionWithPlan(prisma, userId, { productType: CORE_PRODUCT_TYPE }),
				prisma.plan.findMany({
					where: { isActive: true, productType: CORE_PRODUCT_TYPE },
					orderBy: [{ priceMinor: 'asc' }],
				}),
				prisma.walletLedger.findMany({
					where: { userId },
					take: Math.min(Number(historyLimit) || 20, 100),
					orderBy: { createdAt: 'desc' },
				}),
				prisma.payment.findMany({
					where: { userId },
					take: Math.min(Number(historyLimit) || 20, 100),
					orderBy: { createdAt: 'desc' },
				}),
				discountService.getAutomaticDiscountsSummary({ userId }),
				discountService.getRecentDiscountRedemptions({ userId, limit: historyLimit }),
			])

			return {
				wallet: {
					balanceMinor: wallet?.balanceMinor || 0,
					balance: formatMoneyMinor(wallet?.balanceMinor || 0),
					currency: wallet?.currency || DEFAULT_CURRENCY,
				},
				activeSubscription: serializeSubscription(activeSubscription),
				plans: plans.map(serializePlan),
				paygPricing: {
					basicMinor: PAYG_PRICING_MINOR.basic,
					basic: formatMoneyMinor(PAYG_PRICING_MINOR.basic),
					premiumMinor: PAYG_PRICING_MINOR.premium,
					premium: formatMoneyMinor(PAYG_PRICING_MINOR.premium),
				},
				usageSnapshot: {
					remainingIncludedRequests: activeSubscription
						? Math.max(activeSubscription.includedRequests - activeSubscription.usedRequests, 0)
						: 0,
					mode: activeSubscription ? activeSubscription.plan.code : 'payg',
				},
				recentLedger: ledger.map(serializeLedgerEntry),
				recentPayments: payments.map(serializePayment),
				automaticDiscounts,
				recentDiscounts,
			}
		} catch (error) {
			if (!isLegacyBillingSchemaError(error)) throw error
			return getLegacySummary({ userId, historyLimit })
		}
	},

	async getHistory({ userId, limit = 50 }) {
		const [payments, ledger, discounts] = await Promise.all([
			prisma.payment.findMany({
				where: { userId },
				take: Math.min(limit, 200),
				orderBy: { createdAt: 'desc' },
			}),
			prisma.walletLedger.findMany({
				where: { userId },
				take: Math.min(limit, 200),
				orderBy: { createdAt: 'desc' },
			}),
			discountService.getRecentDiscountRedemptions({ userId, limit }),
		])

		return {
			payments: payments.map(serializePayment),
			ledger: ledger.map(serializeLedgerEntry),
			discounts,
		}
	},

	async getPaymentById({ paymentId, actorUserId }) {
		const payment = await prisma.payment.findUnique({
			where: { id: paymentId },
			include: { events: { orderBy: { receivedAt: 'desc' } } },
		})
		if (!payment) throw new AppError('Payment not found', 404)
		if (payment.userId !== actorUserId && !(await isAdminUser(actorUserId))) {
			throw new AppError('Forbidden', 403)
		}
		return {
			...serializePayment(payment),
			events: payment.events,
		}
	},
}
