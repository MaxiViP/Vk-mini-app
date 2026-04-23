import assert from 'node:assert/strict'

import { canBuyPlanFromWallet } from '../src/domain/billingRules.js'
import { getChatHistorySource, shouldUseAiApi } from '../src/domain/chatModeRules.js'

export const cases = [
	{
		name: 'chatMode=core does not use /api/ai/* transport',
		run: async () => {
			assert.equal(shouldUseAiApi('core'), false)
			assert.equal(getChatHistorySource('core'), 'workspace')
		},
	},
	{
		name: 'chatMode=ai uses /api/ai/* transport',
		run: async () => {
			assert.equal(shouldUseAiApi('ai'), true)
			assert.equal(getChatHistorySource('ai'), 'backend-db')
		},
	},
	{
		name: 'core and ai history sources stay separated',
		run: async () => {
			const coreHistorySource = getChatHistorySource('core')
			const aiHistorySource = getChatHistorySource('ai')

			assert.equal(coreHistorySource, 'workspace')
			assert.equal(aiHistorySource, 'backend-db')
			assert.notEqual(coreHistorySource, aiHistorySource)

			assert.equal(shouldUseAiApi('core'), false)
			assert.equal(shouldUseAiApi('ai'), true)
		},
	},
	{
		name: 'plan purchase decision uses wallet.balanceMinor, not display balance',
		run: async () => {
			const canBuy = canBuyPlanFromWallet({
				walletBalanceMinor: 500,
				planPriceMinor: 1000,
				displayBalance: 999999,
			})

			assert.equal(canBuy, false)
		},
	},
]
