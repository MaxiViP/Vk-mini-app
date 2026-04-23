import axios from 'axios'
import type { TopupPreview, YooKassaPaymentSession } from '../types'
import { authorizedAxiosRequest } from '../services/authSession'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''
export async function createYooKassaPaymentRequest(
	amount: number,
	accessToken: string,
	promoCode?: string,
): Promise<YooKassaPaymentSession> {
	const response = await authorizedAxiosRequest<YooKassaPaymentSession>(
		{
			method: 'POST',
			url: `${API_BASE_URL}/api/payments/yookassa/create`,
			data: { amount, promoCode },
		},
		{ accessToken },
	)
	return response.data
}

export async function previewYooKassaPaymentRequest(
	amount: number,
	accessToken: string,
	promoCode?: string,
): Promise<TopupPreview> {
	const response = await authorizedAxiosRequest<TopupPreview>(
		{
			method: 'POST',
			url: `${API_BASE_URL}/api/payments/yookassa/preview`,
			data: { amount, promoCode },
		},
		{ accessToken },
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
	const response = await authorizedAxiosRequest<{
		paymentId: string
		status: 'succeeded'
		amount: number
		baseAmountMinor: number
		bonusMinor: number
		creditedAmountMinor: number
		appliedDiscount?: YooKassaPaymentSession['appliedDiscount']
		isStub: boolean
	}>(
		{
			method: 'POST',
			url: `${API_BASE_URL}/api/payments/yookassa/confirm`,
			data: { paymentId },
		},
		{ accessToken },
	)
	return response.data
}
