import { User } from './models/User.js'

app.post('/api/chat', authMiddleware, async (req, res) => {
	const user = await User.findById(req.userId)
	if (user.requestsLeft <= 0) {
		return res.status(403).json({ error: 'Запросы закончились, пополните баланс' })
	}

	// уменьшаем количество оставшихся запросов
	user.requestsLeft -= 1
	await user.save()

	// далее твой LLM код
})
