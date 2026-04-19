import axios from 'axios'
import type { TopupPreview, YooKassaPaymentSession } from '../types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''
export async function createYooKassaPaymentRequest(
	amount: number,
	accessToken: string,
	promoCode?: string,
): Promise<YooKassaPaymentSession> {
	const response = await axios.post<YooKassaPaymentSession>(
		`${API_BASE_URL}/api/payments/yookassa/create`,
		{ amount, promoCode },
		{
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
		},
	)
	return response.data
}

export async function previewYooKassaPaymentRequest(
	amount: number,
	accessToken: string,
	promoCode?: string,
): Promise<TopupPreview> {
	const response = await axios.post<TopupPreview>(
		`${API_BASE_URL}/api/payments/yookassa/preview`,
		{ amount, promoCode },
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
	baseAmountMinor: number
	bonusMinor: number
	creditedAmountMinor: number
	appliedDiscount?: YooKassaPaymentSession['appliedDiscount']
	isStub: boolean
}> {
	const response = await axios.post<{
		paymentId: string
		status: 'succeeded'
		amount: number
		baseAmountMinor: number
		bonusMinor: number
		creditedAmountMinor: number
		appliedDiscount?: YooKassaPaymentSession['appliedDiscount']
		isStub: boolean
	}>(
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
