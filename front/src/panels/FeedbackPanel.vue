<template>
	<section v-if="FEATURES.feedbackPage" class="feedback-panel">
		<div class="feedback-panel__hero">
			<span class="feedback-panel__eyebrow">Обратная связь</span>
			<h1>Обратная связь</h1>
			<p>Сообщите о баге, предложите идею или задайте вопрос. Сейчас обращения сохраняются только локально.</p>
		</div>

		<form class="feedback-form" @submit.prevent="submitFeedback">
			<label>
				<span>Тип обращения</span>
				<select v-model="feedbackType" :class="{ 'feedback-field--invalid': submitted && !feedbackType }">
					<option value="" disabled>Выберите тип</option>
					<option v-for="option in feedbackTypeOptions" :key="option.value" :value="option.value">
						{{ option.label }}
					</option>
				</select>
			</label>

			<label>
				<span>Тема</span>
				<input
					v-model.trim="subject"
					type="text"
					placeholder="Коротко опишите тему"
					:class="{ 'feedback-field--invalid': submitted && !subject }"
				/>
			</label>

			<label>
				<span>Сообщение</span>
				<textarea
					v-model.trim="message"
					rows="6"
					placeholder="Опишите детали обращения"
					:class="{ 'feedback-field--invalid': submitted && !message }"
				></textarea>
			</label>

			<div v-if="validationErrors.length" class="feedback-errors" role="alert">
				<span v-for="error in validationErrors" :key="error">{{ error }}</span>
			</div>

			<div v-if="successMessage" class="feedback-success" role="status">
				{{ successMessage }}
			</div>

			<div class="feedback-form__actions">
				<button type="submit" class="pill-btn pill-btn--active">Отправить</button>
				<button type="button" class="pill-btn" @click="clearForm">Очистить форму</button>
			</div>
		</form>
	</section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

import { FEATURES } from '../config/features'
import { trackEvent } from '../utils/analytics'

type FeedbackType = 'bug' | 'idea' | 'question' | 'billing'

type LocalFeedbackItem = {
	id: string
	type: FeedbackType
	subject: string
	message: string
	createdAt: string
}

const FEEDBACK_STORAGE_KEY = 'vk-mini-app-feedback'

const feedbackType = ref<FeedbackType | ''>('')
const subject = ref('')
const message = ref('')
const submitted = ref(false)
const successMessage = ref('')

const feedbackTypeOptions: Array<{ value: FeedbackType; label: string }> = [
	{ value: 'bug', label: 'баг' },
	{ value: 'idea', label: 'идея' },
	{ value: 'question', label: 'вопрос' },
	{ value: 'billing', label: 'оплата' },
]

const validationErrors = computed(() => {
	if (!submitted.value) return []

	const errors: string[] = []
	if (!feedbackType.value) errors.push('Выберите тип обращения.')
	if (!subject.value) errors.push('Заполните тему.')
	if (!message.value) errors.push('Заполните сообщение.')
	return errors
})

const readStoredFeedback = (): LocalFeedbackItem[] => {
	try {
		const rawItems = localStorage.getItem(FEEDBACK_STORAGE_KEY)
		if (!rawItems) return []

		const parsedItems = JSON.parse(rawItems)
		return Array.isArray(parsedItems) ? parsedItems : []
	} catch {
		return []
	}
}

const saveFeedbackLocally = (item: LocalFeedbackItem) => {
	const items = readStoredFeedback()
	localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify([item, ...items].slice(0, 20)))
}

const clearForm = () => {
	feedbackType.value = ''
	subject.value = ''
	message.value = ''
	submitted.value = false
	successMessage.value = ''
}

const submitFeedback = () => {
	submitted.value = true
	successMessage.value = ''

	if (validationErrors.value.length || !feedbackType.value) return

	saveFeedbackLocally({
		id: `${Date.now()}`,
		type: feedbackType.value,
		subject: subject.value,
		message: message.value,
		createdAt: new Date().toISOString(),
	})

	trackEvent('feedback_sent', { type: feedbackType.value, subjectLength: subject.value.length })
	successMessage.value = 'Спасибо! Обращение сохранено локально. Позже мы подключим отправку на сервер.'
	submitted.value = false
	subject.value = ''
	message.value = ''
}
</script>
