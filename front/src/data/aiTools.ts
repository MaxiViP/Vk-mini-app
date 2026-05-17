export type AiTool = {
	id: string
	title: string
	description: string
	category: string
	inputLabel: string
	placeholder: string
	promptPrefix: string
	isPremium?: boolean
	isHidden?: boolean
}

export const AI_TOOLS: AiTool[] = [
	{
		id: 'shorten-text',
		title: 'Сократить текст',
		description: 'Сделать текст короче без потери смысла.',
		category: 'Тексты',
		inputLabel: 'Текст для сокращения',
		placeholder: 'Вставьте текст, который нужно сократить...',
		promptPrefix: 'Сократи текст без потери смысла. Сохрани ключевые факты и сделай результат понятным:',
	},
	{
		id: 'improve-text',
		title: 'Улучшить текст',
		description: 'Сделать текст яснее, грамотнее и убедительнее.',
		category: 'Тексты',
		inputLabel: 'Текст для улучшения',
		placeholder: 'Вставьте черновик текста...',
		promptPrefix: 'Улучши текст: исправь стиль, структуру и ясность, сохрани исходный смысл:',
	},
	{
		id: 'business-style',
		title: 'Переписать в деловом стиле',
		description: 'Сделать сообщение вежливым и профессиональным.',
		category: 'Работа',
		inputLabel: 'Сообщение',
		placeholder: 'Вставьте сообщение, которое нужно переписать...',
		promptPrefix: 'Перепиши сообщение в деловом стиле. Сохрани смысл, сделай тон вежливым и профессиональным:',
	},
	{
		id: 'simple-words',
		title: 'Переписать простыми словами',
		description: 'Упростить сложный текст для широкой аудитории.',
		category: 'Тексты',
		inputLabel: 'Сложный текст',
		placeholder: 'Вставьте текст или объяснение...',
		promptPrefix: 'Перепиши текст простыми словами. Убери сложные формулировки и сохрани смысл:',
	},
	{
		id: 'fix-errors',
		title: 'Исправить ошибки',
		description: 'Проверить орфографию, пунктуацию и грамматику.',
		category: 'Тексты',
		inputLabel: 'Текст для проверки',
		placeholder: 'Вставьте текст с возможными ошибками...',
		promptPrefix: 'Исправь ошибки в тексте. После исправленного варианта кратко перечисли важные правки:',
	},
	{
		id: 'vk-post',
		title: 'Сделать пост для VK',
		description: 'Подготовить публикацию для сообщества, товара или события.',
		category: 'VK',
		inputLabel: 'Тема и детали поста',
		placeholder: 'Опишите тему, аудиторию, оффер и желаемый тон...',
		promptPrefix: 'Напиши пост для VK. Сделай текст живым, понятным и добавь призыв к действию, если он уместен:',
	},
	{
		id: 'headlines',
		title: 'Сделать заголовки',
		description: 'Придумать варианты заголовков для поста, статьи или объявления.',
		category: 'Контент',
		inputLabel: 'Тема',
		placeholder: 'Опишите тему и аудиторию...',
		promptPrefix: 'Придумай 10 вариантов заголовков. Сделай их разными по стилю и длине:',
	},
	{
		id: 'make-plan',
		title: 'Составить план',
		description: 'Разложить задачу на понятные шаги.',
		category: 'Планирование',
		inputLabel: 'Задача',
		placeholder: 'Опишите задачу, сроки и ограничения...',
		promptPrefix: 'Составь пошаговый план для задачи. Укажи порядок действий, риски и первый шаг:',
	},
	{
		id: 'faq',
		title: 'Создать FAQ',
		description: 'Собрать вопросы и ответы для продукта, услуги или инструкции.',
		category: 'Бизнес',
		inputLabel: 'Описание продукта или темы',
		placeholder: 'Опишите продукт, услугу или тему FAQ...',
		promptPrefix: 'Создай FAQ: составь частые вопросы и понятные ответы на основе описания:',
	},
	{
		id: 'translate',
		title: 'Перевести текст',
		description: 'Перевести текст с сохранением смысла и тона.',
		category: 'Тексты',
		inputLabel: 'Текст и язык перевода',
		placeholder: 'Например: переведи на английский, тон деловой. Текст: ...',
		promptPrefix: 'Переведи текст. Сохрани смысл, тон и форматирование, если они важны:',
	},
	{
		id: 'explain-code',
		title: 'Объяснить код',
		description: 'Пояснить, что делает фрагмент кода и где могут быть риски.',
		category: 'Код',
		inputLabel: 'Код',
		placeholder: 'Вставьте фрагмент кода...',
		promptPrefix: 'Объясни, что делает этот код. Опиши ключевые части, возможные проблемы и улучшения:',
		isPremium: true,
	},
	{
		id: 'readme',
		title: 'Составить README',
		description: 'Подготовить структуру README для проекта.',
		category: 'Код',
		inputLabel: 'Описание проекта',
		placeholder: 'Опишите проект, стек, запуск и основные возможности...',
		promptPrefix: 'Составь README для проекта. Добавь описание, установку, запуск, структуру и примеры использования:',
		isPremium: true,
	},
]

export const AI_TOOL_CATEGORIES = ['Все', ...Array.from(new Set(AI_TOOLS.map(tool => tool.category)))] as const
