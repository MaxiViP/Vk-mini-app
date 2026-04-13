import { authMiddleware } from './middleware/auth.js'
import { User } from './models/User.js'

router.post('/user/recharge', authMiddleware, async (req, res) => {
	const { amount } = req.body
	const user = await User.findById(req.userId)
	if (!user) return res.status(404).json({ error: 'User not found' })

	user.balance += amount
	user.requestsLeft += amount * 10 // допустим 1 ₽ = 10 запросов
	await user.save()

	res.json({ balance: user.balance, requestsLeft: user.requestsLeft })
})
