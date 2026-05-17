export type ChatExample = {
	id: string
	title: string
	prompt: string
}

export const CHAT_EXAMPLES: ChatExample[] = [
	{
		id: 'vk-coffee-discount',
		title: 'Напиши пост для VK о скидке на кофе',
		prompt: 'Напиши пост для VK о скидке на кофе',
	},
	{
		id: 'explain-js-promises',
		title: 'Объясни промисы в JavaScript',
		prompt: 'Объясни промисы в JavaScript',
	},
	{
		id: 'exam-prep-plan',
		title: 'Составь план подготовки к экзамену',
		prompt: 'Составь план подготовки к экзамену',
	},
	{
		id: 'business-style-message',
		title: 'Перепиши сообщение в деловом стиле',
		prompt: 'Перепиши сообщение в деловом стиле',
	},
	{
		id: 'text-summary',
		title: 'Сделай краткое содержание текста',
		prompt: 'Сделай краткое содержание текста',
	},
	{
		id: 'content-ideas',
		title: 'Придумай 10 идей для контента',
		prompt: 'Придумай 10 идей для контента',
	},
]
