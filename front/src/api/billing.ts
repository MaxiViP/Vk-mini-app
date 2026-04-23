import axios from 'axios'
import { authorizedAxiosRequest, unwrapAxiosData } from '../services/authSession'

import type { BillingSummary, SubscriptionPurchasePreview, SubscriptionPurchaseResult } from '../types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

export const billingApi = {
	getSummary(accessToken: string) {
		return unwrapAxiosData(
			authorizedAxiosRequest<BillingSummary>(
				{
					method: 'GET',
					url: `${API_BASE_URL}/api/billing/summary`,
				},
				{ accessToken },
			),
		)
	},

	previewSubscriptionPurchase(planCode: string, accessToken: string, promoCode?: string) {
		return unwrapAxiosData(
			authorizedAxiosRequest<SubscriptionPurchasePreview>(
				{
					method: 'POST',
					url: `${API_BASE_URL}/api/billing/subscriptions/preview`,
					data: {
						planCode,
						promoCode,
					},
				},
				{ accessToken },
			),
		)
	},

	purchaseSubscription(planCode: string, accessToken: string, idempotencyKey: string, promoCode?: string) {
		return unwrapAxiosData(
			authorizedAxiosRequest<SubscriptionPurchaseResult>(
				{
					method: 'POST',
					url: `${API_BASE_URL}/api/billing/subscriptions/purchase`,
					data: {
						planCode,
						promoCode,
						idempotencyKey,
					},
					headers: {
						'Idempotency-Key': idempotencyKey,
					},
				},
				{ accessToken },
			),
		)
	},
}
