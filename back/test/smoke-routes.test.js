import assert from 'node:assert/strict'

import { aiService } from '../src/modules/ai/ai.service.js'
import { billingService } from '../src/modules/billing/billing.service.js'
import { createAccessToken, startTestServer, stopTestServer } from './helpers/http.js'
import { patchMethod, restoreAll } from './helpers/patch.js'

export const cases = [
	{
		name: 'GET /api/billing/summary does not return 500 with authenticated request',
		run: async () => {
			const restores = [
				patchMethod(billingService, 'getSummary', async () => ({
					wallet: { balanceMinor: 2000, balance: 20, currency: 'RUB' },
					activeSubscription: null,
					plans: [],
					paygPricing: { basicMinor: 500, basic: 5, premiumMinor: 500, premium: 5 },
					usageSnapshot: { remainingIncludedRequests: 0, mode: 'payg' },
					recentLedger: [],
					recentPayments: [],
				})),
			]

			const token = createAccessToken()
			const { server, baseUrl } = await startTestServer()

			try {
				const response = await fetch(`${baseUrl}/api/billing/summary`, {
					headers: { Authorization: `Bearer ${token}` },
				})
				const payload = await response.json()

				assert.notEqual(response.status, 500)
				assert.equal(response.status, 200)
				assert.equal(payload.wallet.balanceMinor, 2000)
			} finally {
				restoreAll(restores)
				await stopTestServer(server)
			}
		},
	},
	{
		name: 'GET /api/ai/plans returns an array with authenticated request',
		run: async () => {
			const restores = [
				patchMethod(aiService, 'getPlans', async () => [
					{
						id: 'plan-1',
						code: 'ai-start',
						name: 'AI Start',
						productType: 'ai',
						priceMinor: 29900,
						intervalDays: 30,
						includedRequests: 0,
						accessTier: 'basic',
						aiChatLimit: 300,
						aiVoiceLimit: 30,
						aiFileUploadLimit: 20,
						isActive: true,
					},
				]),
			]

			const token = createAccessToken()
			const { server, baseUrl } = await startTestServer()

			try {
				const response = await fetch(`${baseUrl}/api/ai/plans`, {
					headers: { Authorization: `Bearer ${token}` },
				})
				const payload = await response.json()

				assert.equal(response.status, 200)
				assert.ok(Array.isArray(payload))
				assert.equal(payload[0].code, 'ai-start')
			} finally {
				restoreAll(restores)
				await stopTestServer(server)
			}
		},
	},
]
