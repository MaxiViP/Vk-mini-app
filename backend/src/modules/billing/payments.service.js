import { AppError } from '../../shared/errors.js'
import logger from '../../config/logger.js'

export const paymentsService = {
	async createPaymentIntent({ amount, currency = 'RUB', userId, paymentMethod = 'card' }) {
		// Валидация
		if (amount <= 0) throw new AppError('Неверная сумма', 400)
		if (!['RUB', 'USD', 'EUR'].includes(currency)) throw new AppError('Неподдерживаемая валюта', 400)
		if (!userId) throw new AppError('Требуется ID пользователя', 400)
		if (!['card', 'mir', 'sberbank', 'tinkoff', 'qiwi', 'yoomoney'].includes(paymentMethod)) {
			throw new AppError('Неподдерживаемый метод оплаты', 400)
		}

		try {
			const paymentIntent = {
				id: `pi_${Date.now()}_${userId}`,
				amount,
				currency,
				paymentMethod,
				status: 'requires_payment_method',
				userId,
				createdAt: new Date().toISOString(),
			}

			logger.info('Создан платежный intent', {
				paymentIntentId: paymentIntent.id,
				userId,
				amount,
				currency,
				paymentMethod,
			})
			return paymentIntent
		} catch (error) {
			logger.error('Ошибка при создании платежного intent', { error: error.message, userId, amount })
			throw new AppError('Не удалось обработать платеж', 500)
		}
	},
}
