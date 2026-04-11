import axios from 'axios'
import type { YooKassaPaymentSession } from '../types'

const API_BASE_URL = ''
export async function createYooKassaPaymentRequest(
	amount: number,
	accessToken: string,
): Promise<YooKassaPaymentSession> {
	const response = await axios.post<YooKassaPaymentSession>(
		`${API_BASE_URL}/api/payments/yookassa/create`,
		{ amount },
		{
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
		},
	)
	return response.data
}

export async function confirmYooKassaPaymentRequest(
	paymentId: string,
	accessToken: string,
): Promise<{
	paymentId: string
	status: 'succeeded'
	amount: number
	isStub: boolean
}> {
	const response = await axios.post(
		`${API_BASE_URL}/api/payments/yookassa/confirm`,
		{ paymentId },
		{
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
		},
	)
	return response.data
}
