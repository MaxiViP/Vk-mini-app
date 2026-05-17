export type HomeCard = {
	id: string
	title: string
	description: string
	prompt?: string
	targetPanel?: string
	badge?: string
	isPremium?: boolean
	isHidden?: boolean
}

export const HOME_PROMPT_STORAGE_KEY = 'vk-mini-app:pending-home-prompt'
export const HOME_PROMPT_EVENT = 'home-prompt-selected'

export const HOME_CARDS: HomeCard[] = [
	{
		id: 'vk-post',
		title: 'Написать пост VK',
		description: 'Подготовить пост для сообщества, товара, события или новости.',
		prompt: 'Помоги написать пост для VK на тему: ',
		badge: 'VK',
	},
	{
		id: 'client-reply',
		title: 'Ответить клиенту',
		description: 'Составить вежливый и понятный ответ на сообщение клиента.',
		prompt: 'Помоги ответить клиенту на сообщение: ',
		badge: 'SMM',
	},
	{
		id: 'shorten-text',
		title: 'Сократить текст',
		description: 'Сделать текст короче без потери смысла и важных деталей.',
		prompt: 'Сократи текст без потери смысла: ',
	},
	{
		id: 'improve-text',
		title: 'Улучшить текст',
		description: 'Сделать текст грамотнее, яснее и убедительнее.',
		prompt: 'Улучши текст: ',
	},
	{
		id: 'explain-simple',
		title: 'Объяснить простыми словами',
		description: 'Разобрать сложную тему понятным языком.',
		prompt: 'Объясни простыми словами: ',
	},
	{
		id: 'make-plan',
		title: 'Составить план',
		description: 'Собрать пошаговый план действий для задачи.',
		prompt: 'Составь пошаговый план для задачи: ',
	},
	{
		id: 'parse-file',
		title: 'Разобрать файл',
		description: 'Открыть чат и подготовить запрос для анализа файла.',
		prompt: 'Помоги разобрать файл. Я прикреплю файл и опишу задачу: ',
		badge: 'Файлы',
	},
	{
		id: 'voice-question',
		title: 'Спросить голосом',
		description: 'Перейти в чат и задать вопрос голосом.',
		targetPanel: 'chat',
		badge: 'Голос',
	},
]
