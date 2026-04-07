import axios from 'axios'
import type { YooKassaPaymentSession } from '../types'

const API_BASE_URL = ''
export async function createYooKassaPaymentRequest(amount: number): Promise<YooKassaPaymentSession> {
	const response = await axios.post<YooKassaPaymentSession>(`${API_BASE_URL}/api/payments/yookassa/create`, { amount })
	return response.data
}

export async function confirmYooKassaPaymentRequest(paymentId: string): Promise<{
	paymentId: string
	status: 'succeeded'
	amount: number
	isStub: boolean
}> {
	const response = await axios.post(`${API_BASE_URL}/api/payments/yookassa/confirm`, { paymentId })
	return response.data
}
