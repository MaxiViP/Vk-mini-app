import axios from 'axios'

import type { BillingSummary } from '../types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

export const billingApi = {
	getSummary(accessToken: string) {
		return axios
			.get<BillingSummary>(`${API_BASE_URL}/api/billing/summary`, {
				headers: { Authorization: `Bearer ${accessToken}` },
			})
			.then(response => response.data)
	},

	purchaseSubscription(planCode: string, accessToken: string, idempotencyKey: string) {
		return axios
			.post(
				`${API_BASE_URL}/api/billing/subscriptions/purchase`,
				{
					planCode,
					idempotencyKey,
				},
				{
					headers: {
						Authorization: `Bearer ${accessToken}`,
						'Idempotency-Key': idempotencyKey,
					},
				},
			)
			.then(response => response.data)
	},
}
