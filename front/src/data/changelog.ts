export type ChangelogItem = {
	id: string
	date: string
	title: string
	description: string
	type: 'feature' | 'fix' | 'improvement' | 'billing'
}

export const CHANGELOG_ITEMS: ChangelogItem[] = [
	{
		id: 'home-page',
		date: '2026-05-17',
		title: 'Добавлена главная страница',
		description: 'Появился стартовый экран с быстрыми сценариями, возможностями приложения и переходами к ключевым разделам.',
		type: 'feature',
	},
	{
		id: 'prompt-catalog',
		date: '2026-05-17',
		title: 'Добавлен каталог шаблонов',
		description: 'Добавлены готовые AI-шаблоны с поиском, категориями, копированием и открытием prompt в чате.',
		type: 'feature',
	},
	{
		id: 'ai-tools',
		date: '2026-05-17',
		title: 'Добавлены AI-инструменты',
		description: 'Появились отдельные формы для типовых задач: текст, идеи, планы, объяснения и другие быстрые действия.',
		type: 'feature',
	},
	{
		id: 'chat-empty-state',
		date: '2026-05-17',
		title: 'Улучшено пустое состояние чата',
		description: 'Новый пользователь видит приветствие, быстрые примеры запросов и понятные переходы к шаблонам.',
		type: 'improvement',
	},
	{
		id: 'chat-actions-stability',
		date: '2026-05-17',
		title: 'Исправлена устойчивость действий в чате',
		description: 'Действия под ответами аккуратнее обрабатывают копирование и повторное использование текста.',
		type: 'fix',
	},
	{
		id: 'answer-actions',
		date: '2026-05-17',
		title: 'Добавлены действия под AI-ответами',
		description: 'Ответы AI можно копировать, сохранять, переиспользовать и продолжать с помощью быстрых действий.',
		type: 'feature',
	},
	{
		id: 'tariffs-page',
		date: '2026-05-17',
		title: 'Добавлена страница тарифов',
		description: 'Добавлен отдельный экран тарифов с текущим планом, лимитами, сравнением и payment-заглушками.',
		type: 'billing',
	},
	{
		id: 'help-safety-pages',
		date: '2026-05-17',
		title: 'Добавлены страницы помощи и безопасности',
		description: 'Появились информационные разделы с подсказками по работе приложения и правилами безопасного использования AI.',
		type: 'improvement',
	},
	{
		id: 'bonuses-page',
		date: '2026-05-18',
		title: 'Добавлена страница бонусов',
		description: 'Добавлен UI будущей бонусной системы: баланс-заглушка, задания, daily-блок и реферальный блок.',
		type: 'feature',
	},
]
