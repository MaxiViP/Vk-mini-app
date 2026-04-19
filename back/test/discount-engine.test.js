import assert from 'node:assert/strict'

import prisma from '../src/db/prisma.js'
import { billingService } from '../src/modules/billing/billing.service.js'
import { discountService } from '../src/modules/billing/discount.service.js'
import { patchMethod, restoreAll } from './helpers/patch.js'

const createDiscountDb = ({ promoDiscount = null, automaticDiscounts = [], usageByDiscountId = {}, hasPriorPurchase = false }) => ({
	discount: {
		findUnique: async ({ where }) =>
			promoDiscount && promoDiscount.code === where.code
				? promoDiscount
				: automaticDiscounts.find(discount => discount.code === where.code) || null,
		findMany: async () => automaticDiscounts,
	},
	discountRedemption: {
		count: async ({ where }) => {
			const usage = usageByDiscountId[where.discountId] || { globalUses: 0, userUses: 0 }
			return where.userId ? usage.userUses : usage.globalUses
		},
	},
	payment: {
		count: async () => (hasPriorPurchase ? 1 : 0),
	},
	walletLedger: {
		count: async () => (hasPriorPurchase ? 1 : 0),
	},
})

const createDiscount = overrides => ({
	id: overrides.id || `discount-${Math.random().toString(16).slice(2)}`,
	code: overrides.code ?? null,
	name: overrides.name || 'Test discount',
	description: overrides.description || null,
	discountType: overrides.discountType || 'percent',
	value: overrides.value ?? 10,
	productType: overrides.productType ?? null,
	planCode: overrides.planCode ?? null,
	isActive: overrides.isActive ?? true,
	isAutomatic: overrides.isAutomatic ?? false,
	startsAt: overrides.startsAt ?? null,
	endsAt: overrides.endsAt ?? null,
	maxUses: overrides.maxUses ?? null,
	maxUsesPerUser: overrides.maxUsesPerUser ?? null,
	firstPurchaseOnly: overrides.firstPurchaseOnly ?? false,
	allowStacking: overrides.allowStacking ?? false,
	targetUserId: overrides.targetUserId ?? null,
})

export const cases = [
	{
		name: 'discount preview applies valid subscription promo code',
		run: async () => {
			const promoDiscount = createDiscount({
				id: 'spring20',
				code: 'SPRING20',
				name: 'Spring 20%',
				discountType: 'percent',
				value: 20,
				productType: 'core',
				planCode: 'monthly-premium',
			})

			const preview = await discountService.previewSubscriptionPurchase({
				db: createDiscountDb({ promoDiscount }),
				userId: 'user-1',
				productType: 'core',
				planCode: 'monthly-premium',
				basePriceMinor: 199000,
				promoCode: 'spring20',
			})

			assert.equal(preview.basePriceMinor, 199000)
			assert.equal(preview.discountMinor, 39800)
			assert.equal(preview.finalPriceMinor, 159200)
			assert.equal(preview.appliedDiscount?.code, 'SPRING20')
		},
	},
	{
		name: 'discount preview rejects invalid promo code',
		run: async () => {
			await assert.rejects(
				() =>
					discountService.previewSubscriptionPurchase({
						db: createDiscountDb({}),
						userId: 'user-1',
						productType: 'core',
						planCode: 'monthly-premium',
						basePriceMinor: 199000,
						promoCode: 'UNKNOWN',
					}),
				error => {
					assert.equal(error?.statusCode, 400)
					assert.equal(error?.details?.code, 'DISCOUNT_CODE_INVALID')
					return true
				},
			)
		},
	},
	{
		name: 'discount preview rejects expired promo code',
		run: async () => {
			const promoDiscount = createDiscount({
				id: 'expired',
				code: 'OLDPROMO',
				discountType: 'percent',
				value: 10,
				endsAt: new Date(Date.now() - 60_000),
			})

			await assert.rejects(
				() =>
					discountService.previewSubscriptionPurchase({
						db: createDiscountDb({ promoDiscount }),
						userId: 'user-1',
						productType: 'core',
						planCode: 'monthly-premium',
						basePriceMinor: 199000,
						promoCode: 'OLDPROMO',
					}),
				error => {
					assert.equal(error?.statusCode, 400)
					assert.equal(error?.details?.reason, 'expired')
					return true
				},
			)
		},
	},
	{
		name: 'automatic discount is applied for AI plan without promo code',
		run: async () => {
			const autoDiscount = createDiscount({
				id: 'auto-ai-15',
				code: 'AUTO_AI_15',
				name: 'AI Auto 15%',
				discountType: 'percent',
				value: 15,
				productType: 'ai',
				isAutomatic: true,
			})

			const preview = await discountService.previewSubscriptionPurchase({
				db: createDiscountDb({ automaticDiscounts: [autoDiscount] }),
				userId: 'user-1',
				productType: 'ai',
				planCode: 'ai-start',
				basePriceMinor: 29900,
			})

			assert.equal(preview.discountMinor, 4485)
			assert.equal(preview.finalPriceMinor, 25415)
			assert.equal(preview.appliedDiscount?.code, 'AUTO_AI_15')
			assert.equal(preview.appliedDiscount?.isAutomatic, true)
		},
	},
	{
		name: 'best discount wins when promo code and automatic discount are both applicable',
		run: async () => {
			const promoDiscount = createDiscount({
				id: 'promo-10',
				code: 'PROMO10',
				name: 'Promo 10%',
				discountType: 'percent',
				value: 10,
				productType: 'ai',
				planCode: 'ai-start',
			})
			const autoDiscount = createDiscount({
				id: 'auto-15',
				code: 'AUTO15',
				name: 'Auto 15%',
				discountType: 'percent',
				value: 15,
				productType: 'ai',
				isAutomatic: true,
			})

			const preview = await discountService.previewSubscriptionPurchase({
				db: createDiscountDb({
					promoDiscount,
					automaticDiscounts: [autoDiscount],
				}),
				userId: 'user-1',
				productType: 'ai',
				planCode: 'ai-start',
				basePriceMinor: 10000,
				promoCode: 'PROMO10',
			})

			assert.equal(preview.discountMinor, 1500)
			assert.equal(preview.appliedDiscount?.code, 'AUTO15')
			assert.equal(preview.appliedDiscount?.isAutomatic, true)
			assert.match(preview.message || '', /Automatic discount/i)
		},
	},
	{
		name: 'subscription discount never makes final price negative',
		run: async () => {
			const promoDiscount = createDiscount({
				id: 'fixed-big',
				code: 'BIGSAVE',
				name: 'Big Save',
				discountType: 'fixed_minor',
				value: 5000,
			})

			const preview = await discountService.previewSubscriptionPurchase({
				db: createDiscountDb({ promoDiscount }),
				userId: 'user-1',
				productType: 'core',
				planCode: 'weekly-basic',
				basePriceMinor: 3000,
				promoCode: 'BIGSAVE',
			})

			assert.equal(preview.discountMinor, 3000)
			assert.equal(preview.finalPriceMinor, 0)
		},
	},
	{
		name: 'wallet topup preview applies bonus promo code',
		run: async () => {
			const promoDiscount = createDiscount({
				id: 'topup10',
				code: 'TOPUP10',
				name: 'Top Up 10%',
				discountType: 'topup_bonus_percent',
				value: 10,
			})

			const preview = await discountService.previewWalletTopup({
				db: createDiscountDb({ promoDiscount }),
				userId: 'user-1',
				baseAmountMinor: 100000,
				promoCode: 'TOPUP10',
			})

			assert.equal(preview.baseAmountMinor, 100000)
			assert.equal(preview.bonusMinor, 10000)
			assert.equal(preview.creditedAmountMinor, 110000)
			assert.equal(preview.appliedDiscount?.code, 'TOPUP10')
		},
	},
	{
		name: 'first purchase and max uses per user restrictions are enforced',
		run: async () => {
			const firstOnlyDiscount = createDiscount({
				id: 'first50',
				code: 'FIRST50',
				name: 'First 50',
				discountType: 'fixed_minor',
				value: 5000,
				firstPurchaseOnly: true,
				maxUsesPerUser: 1,
			})

			await assert.rejects(
				() =>
					discountService.previewSubscriptionPurchase({
						db: createDiscountDb({
							promoDiscount: firstOnlyDiscount,
							hasPriorPurchase: true,
						}),
						userId: 'user-1',
						productType: 'core',
						planCode: 'weekly-basic',
						basePriceMinor: 10000,
						promoCode: 'FIRST50',
					}),
				error => {
					assert.equal(error?.details?.reason, 'first_purchase_only')
					return true
				},
			)

			await assert.rejects(
				() =>
					discountService.previewSubscriptionPurchase({
						db: createDiscountDb({
							promoDiscount: { ...firstOnlyDiscount, firstPurchaseOnly: false },
							usageByDiscountId: {
								[firstOnlyDiscount.id]: { globalUses: 10, userUses: 1 },
							},
						}),
						userId: 'user-1',
						productType: 'core',
						planCode: 'weekly-basic',
						basePriceMinor: 10000,
						promoCode: 'FIRST50',
					}),
				error => {
					assert.equal(error?.details?.reason, 'max_uses_per_user_reached')
					return true
				},
			)
		},
	},
	{
		name: 'successful payment confirm remains idempotent for bonus redemption',
		run: async () => {
			let walletIncrementMinor = 0
			let ledgerCreates = 0
			let redemptionCreates = 0
			let paymentStatus = 'pending'
			let ledgerExists = false
			let redemptionExists = false

			const payment = {
				id: 'payment-1',
				userId: 'user-1',
				amountMinor: 10000,
				creditedAmountMinor: 11000,
				bonusAmountMinor: 1000,
				promoCodeSnapshot: 'TOPUP10',
				appliedDiscountId: 'discount-topup10',
				appliedDiscountSnapshot: {
					id: 'discount-topup10',
					code: 'TOPUP10',
					name: 'Top Up 10%',
					type: 'topup_bonus_percent',
					value: 10,
					isAutomatic: false,
				},
				status: paymentStatus,
			}

			const tx = {
				payment: {
					findUnique: async () => ({ ...payment, status: paymentStatus }),
					update: async ({ data }) => {
						paymentStatus = data.status || paymentStatus
						return { ...payment, status: paymentStatus }
					},
				},
				walletLedger: {
					findUnique: async () => (ledgerExists ? { id: 'ledger-1' } : null),
					create: async () => {
						ledgerCreates += 1
						ledgerExists = true
						return { id: `ledger-${ledgerCreates}` }
					},
				},
				discountRedemption: {
					findFirst: async () => (redemptionExists ? { id: 'redemption-1' } : null),
					create: async () => {
						redemptionCreates += 1
						redemptionExists = true
						return { id: `redemption-${redemptionCreates}` }
					},
				},
				wallet: {
					upsert: async () => ({ userId: 'user-1', balanceMinor: walletIncrementMinor, currency: 'RUB' }),
					update: async ({ data }) => {
						walletIncrementMinor += data.balanceMinor.increment
						return { balanceMinor: walletIncrementMinor }
					},
				},
			}

			const restores = [
				patchMethod(prisma, '$transaction', async callback => callback(tx)),
				patchMethod(prisma.auditLog, 'create', async () => ({})),
			]

			try {
				await billingService.applySuccessfulPayment(payment)
				await billingService.applySuccessfulPayment(payment)

				assert.equal(walletIncrementMinor, 11000)
				assert.equal(ledgerCreates, 1)
				assert.equal(redemptionCreates, 1)
			} finally {
				restoreAll(restores)
			}
		},
	},
]
