export const paymentsService = {
	async createPaymentIntent({ amount, currency = 'USD' }) {
		return {
			id: `pi_${Date.now()}`,
			amount,
			currency,
			status: 'requires_payment_method',
		}
	},
}
