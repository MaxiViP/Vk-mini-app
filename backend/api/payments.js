import crypto from 'crypto'

const mockPayments = new Map()
const MIN_AMOUNT = 50
const MAX_AMOUNT = 100000

function normalizeAmount(rawAmount) {
	const amount = Number(rawAmount)
	if (!Number.isFinite(amount)) return null
	const rounded = Math.round(amount * 100) / 100
	if (rounded < MIN_AMOUNT || rounded > MAX_AMOUNT) return null
	return rounded
}

function buildQrPlaceholderDataUrl(paymentId, amount) {
	const label = `YooKassa STUB ${paymentId.slice(0, 8)} | ${amount} RUB`
	const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="260" height="260" viewBox="0 0 260 260">
  <rect width="260" height="260" fill="#fff"/>
  <rect x="10" y="10" width="240" height="240" fill="#fff" stroke="#111" stroke-width="4"/>
  <rect x="28" y="28" width="58" height="58" fill="#111"/>
  <rect x="174" y="28" width="58" height="58" fill="#111"/>
  <rect x="28" y="174" width="58" height="58" fill="#111"/>
  <rect x="112" y="112" width="36" height="36" fill="#111"/>
  <text x="130" y="205" text-anchor="middle" font-family="monospace" font-size="12" fill="#111">QR STUB</text>
  <text x="130" y="223" text-anchor="middle" font-family="monospace" font-size="10" fill="#444">${label}</text>
</svg>`

	return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

export function registerPaymentRoutes(app) {
	app.post('/api/payments/yookassa/create', (req, res) => {
		const amount = normalizeAmount(req.body?.amount)
		if (!amount) {
			return res.status(400).json({ error: `Некорректная сумма. Допустимый диапазон: ${MIN_AMOUNT}–${MAX_AMOUNT} ₽` })
		}

		const paymentId = `stub_${crypto.randomUUID()}`
		const payment = {
			paymentId,
			amount,
			status: 'pending',
			confirmationUrl: `https://yookassa.ru/checkout/payments/v2/contract?paymentId=${paymentId}`,
			qrCodeDataUrl: buildQrPlaceholderDataUrl(paymentId, amount),
			qrPayload: `STUB://YOOKASSA/${paymentId}/AMOUNT/${amount}`,
			createdAt: Date.now(),
			isStub: true,
			provider: 'yookassa-stub',
		}

		mockPayments.set(paymentId, payment)
		return res.json(payment)
	})

	app.post('/api/payments/yookassa/confirm', (req, res) => {
		const paymentId = String(req.body?.paymentId || '')
		const payment = mockPayments.get(paymentId)

		if (!payment) {
			return res.status(404).json({ error: 'Платёж не найден' })
		}
		if (payment.status === 'succeeded') {
			return res.json({
				paymentId,
				status: payment.status,
				amount: payment.amount,
				isStub: true,
			})
		}

		payment.status = 'succeeded'
		mockPayments.set(paymentId, payment)
		return res.json({
			paymentId,
			status: payment.status,
			amount: payment.amount,
			isStub: true,
		})
	})

	app.get('/api/payments/yookassa/:paymentId', (req, res) => {
		const paymentId = String(req.params.paymentId || '')
		const payment = mockPayments.get(paymentId)
		if (!payment) {
			return res.status(404).json({ error: 'Платёж не найден' })
		}
		return res.json({
			paymentId: payment.paymentId,
			status: payment.status,
			amount: payment.amount,
			isStub: true,
			provider: 'yookassa-stub',
		})
	})
}
