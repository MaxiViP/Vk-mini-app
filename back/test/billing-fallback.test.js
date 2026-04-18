import assert from 'node:assert/strict'

import prisma from '../src/db/prisma.js'
import { billingService } from '../src/modules/billing/billing.service.js'
import { patchMethod, restoreAll } from './helpers/patch.js'

export const cases = [
	{
		name: 'billing fallback handles Unknown argument `productType` without crashing',
		run: async () => {
			const restores = [
				patchMethod(prisma.plan, 'upsert', async () => {
					throw new Error('Unknown argument `productType`')
				}),
				patchMethod(prisma.wallet, 'upsert', async () => ({ userId: 'user-1', balanceMinor: 1500, currency: 'RUB' })),
				patchMethod(prisma.wallet, 'findUnique', async () => ({ userId: 'user-1', balanceMinor: 1500, currency: 'RUB' })),
				patchMethod(prisma.walletLedger, 'findMany', async () => []),
				patchMethod(prisma.payment, 'findMany', async () => []),
			]

			try {
				const summary = await billingService.getSummary({ userId: 'user-1' })

				assert.equal(summary.legacyBillingMode, true)
				assert.equal(summary.wallet.balanceMinor, 1500)
				assert.ok(Array.isArray(summary.plans))
				assert.ok(summary.plans.length > 0)
			} finally {
				restoreAll(restores)
			}
		},
	},
]
