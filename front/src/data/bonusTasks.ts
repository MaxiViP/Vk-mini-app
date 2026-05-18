export type BonusTask = {
	id: string
	title: string
	description: string
	reward: string
	status: 'available' | 'completed' | 'locked'
	category: 'start' | 'daily' | 'social' | 'premium'
	isHidden?: boolean
}

export type ReferralInfo = {
	title: string
	description: string
	inviterReward: string
	friendReward: string
	linkPlaceholder: string
}

export const BONUS_TASKS: BonusTask[] = [
	{
		id: 'first-ai-question',
		title: 'Первый вопрос AI',
		description: 'Задайте первый вопрос в чате и познакомьтесь с возможностями ассистента.',
		reward: '+5 AI-запросов',
		status: 'available',
		category: 'start',
	},
	{
		id: 'first-voice-request',
		title: 'Первый голосовой запрос',
		description: 'Попробуйте голосовой ввод для быстрого обращения к AI.',
		reward: '+3 голосовых запроса',
		status: 'locked',
		category: 'start',
	},
	{
		id: 'first-file-upload',
		title: 'Первая загрузка файла',
		description: 'Загрузите файл, чтобы подготовить его к будущему анализу в чате.',
		reward: '+2 загрузки файла',
		status: 'locked',
		category: 'start',
	},
	{
		id: 'first-saved-answer',
		title: 'Первый сохранённый ответ',
		description: 'Сохраните полезный ответ AI в заметки.',
		reward: '+5 AI-запросов',
		status: 'available',
		category: 'start',
	},
	{
		id: 'first-template-used',
		title: 'Первый использованный шаблон',
		description: 'Откройте каталог шаблонов и отправьте готовый prompt в чат.',
		reward: '+5 AI-запросов',
		status: 'available',
		category: 'start',
	},
	{
		id: 'first-share',
		title: 'Первый шаринг',
		description: 'Поделитесь ответом или возможностью приложения.',
		reward: '+5 AI-запросов',
		status: 'locked',
		category: 'social',
	},
	{
		id: 'first-invited-friend',
		title: 'Первый приглашённый друг',
		description: 'Пригласите друга и получите бонус после его первого действия.',
		reward: '+10 AI-запросов',
		status: 'locked',
		category: 'social',
	},
	{
		id: 'three-day-streak',
		title: 'Вход 3 дня подряд',
		description: 'Возвращайтесь в приложение три дня подряд.',
		reward: '+10 AI-запросов',
		status: 'available',
		category: 'daily',
	},
]

export const REFERRAL_INFO: ReferralInfo = {
	title: 'Пригласите друга',
	description: 'Поделитесь приложением и получите бонус после первого действия друга.',
	inviterReward: '+10 AI-запросов',
	friendReward: '+10 AI-запросов',
	linkPlaceholder: 'Реферальная ссылка будет доступна после подключения backend.',
}
