export type TariffPlan = {
	id: string
	title: string
	description: string
	price: string
	badge?: string
	features: string[]
	limits: {
		chat: string
		voice: string
		files: string
	}
	isPopular?: boolean
	isCurrent?: boolean
	isHidden?: boolean
}

export const TARIFF_PLANS: TariffPlan[] = [
	{
		id: 'free',
		title: 'Бесплатный',
		description: 'Для знакомства с AI-чатом и редких запросов.',
		price: '0 ₽',
		badge: 'Старт',
		features: ['Базовый AI-чат', 'Готовые шаблоны', 'Оплата по факту при исчерпании лимитов'],
		limits: {
			chat: 'до 10 в день',
			voice: 'нет',
			files: 'нет',
		},
	},
	{
		id: 'basic',
		title: 'Базовый',
		description: 'Для регулярной работы с текстами, учебой и простыми задачами.',
		price: 'от 349 ₽',
		badge: 'База',
		features: ['Больше запросов в чат', 'Базовые модели', 'Промокоды при покупке в профиле'],
		limits: {
			chat: 'до 700 на период',
			voice: 'до 30 на период',
			files: 'до 20 на период',
		},
	},
	{
		id: 'pro',
		title: 'Продвинутый',
		description: 'Для активной работы с контентом, кодом, файлами и голосом.',
		price: 'от 990 ₽',
		badge: 'Популярный',
		features: ['Расширенные лимиты', 'Голосовые запросы', 'Файловый контекст'],
		limits: {
			chat: 'до 1500 на период',
			voice: 'до 120 на период',
			files: 'до 80 на период',
		},
		isPopular: true,
	},
	{
		id: 'max',
		title: 'Максимальный',
		description: 'Для интенсивного использования и сложных сценариев.',
		price: 'от 1990 ₽',
		badge: 'Максимум',
		features: ['Максимальные лимиты', 'Доступ ко всем возможностям', 'Приоритет для тяжелых задач'],
		limits: {
			chat: 'до 2500 на период',
			voice: 'до 300 на период',
			files: 'до 200 на период',
		},
	},
]
