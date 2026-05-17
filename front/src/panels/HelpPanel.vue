<template>
	<section v-if="FEATURES.helpPage" class="info-panel">
		<div class="info-panel__hero">
			<span class="info-panel__eyebrow">Помощь</span>
			<h1>Помощь</h1>
			<p>
				AI Assistant помогает задавать вопросы в чате, использовать готовые шаблоны, работать с голосом,
				файлами и заметками. Ниже собраны основные подсказки для ежедневной работы.
			</p>

			<div class="info-panel__actions">
				<button type="button" class="pill-btn pill-btn--active" @click="navigateTo('chat')">Открыть чат</button>
				<button v-if="FEATURES.promptCatalog" type="button" class="pill-btn" @click="navigateTo('prompts')">
					Открыть шаблоны
				</button>
				<button v-if="FEATURES.tariffsPage" type="button" class="pill-btn" @click="navigateTo('tariffs')">
					Открыть тарифы
				</button>
				<button v-if="FEATURES.feedbackPage" type="button" class="pill-btn" @click="navigateTo('feedback')">
					Написать в обратную связь
				</button>
			</div>
		</div>

		<div class="info-grid">
			<article v-for="item in helpItems" :key="item.title" class="info-card">
				<h2>{{ item.title }}</h2>
				<p>{{ item.text }}</p>
			</article>
		</div>
	</section>
</template>

<script setup lang="ts">
import { FEATURES } from '../config/features'

const emit = defineEmits<{
	(e: 'navigate', panel: string): void
}>()

const navigateTo = (panel: string) => {
	emit('navigate', panel)
}

const helpItems = [
	{
		title: 'Как задать хороший вопрос',
		text: 'Опишите цель, контекст и желаемый формат ответа. Например: “Напиши короткий пост для VK о скидке на кофе, тон дружелюбный, до 700 знаков”.',
	},
	{
		title: 'Как пользоваться шаблонами',
		text: 'Откройте каталог шаблонов, выберите подходящий сценарий и отправьте его в чат. Prompt подставится в поле ввода, после этого его можно дополнить своими деталями.',
	},
	{
		title: 'Как работают AI-инструменты',
		text: 'AI-инструменты собирают типовые запросы для частых задач: текстов, идей, объяснений, планов и кода. Они помогают быстрее сформулировать задачу для чата.',
	},
	{
		title: 'Как пользоваться голосом',
		text: 'В AI-режиме можно записать голосовой запрос, если функция доступна в вашем тарифе и браузер разрешил доступ к микрофону.',
	},
	{
		title: 'Как загружать файлы',
		text: 'Прикрепите файл в AI-чате и напишите, что нужно сделать: кратко пересказать, найти главное, составить вопросы или объяснить содержимое.',
	},
	{
		title: 'Как сохранять заметки',
		text: 'Используйте раздел заметок, чтобы сохранить важный текст или результат работы. Заметки помогают быстро вернуться к полезным ответам.',
	},
	{
		title: 'Как работают тарифы',
		text: 'Тарифы определяют доступные возможности и лимиты: запросы в чат, голосовые запросы и загрузку файлов. Покупка и промокоды выполняются через существующий профиль.',
	},
	{
		title: 'Что делать при ошибке',
		text: 'Проверьте интернет, обновите страницу и попробуйте повторить запрос. Если ошибка повторяется, опишите ситуацию через обратную связь.',
	},
	{
		title: 'Как связаться с поддержкой',
		text: 'Откройте обратную связь, если она доступна в меню, и напишите, что произошло: что вы делали, какой текст ошибки увидели и когда это случилось.',
	},
]
</script>
