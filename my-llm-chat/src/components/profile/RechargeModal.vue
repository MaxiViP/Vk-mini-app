<template>
	<Teleport to="body">
		<Transition name="modal">
			<div v-if="visible" class="modal-overlay" @click.self="close">
				<div class="modal-container modal-container--recharge">
					<button class="modal-close" @click="close">✕</button>

					<div class="modal-content">
						<h3>💰 Пополнение баланса</h3>
						<p>Минимальная сумма: 50 ₽</p>

						<input
							v-model.number="amount"
							type="number"
							min="50"
							step="10"
							placeholder="Введите сумму"
							class="amount-input"
							@keyup.enter="submit"
						/>

						<div class="modal-buttons">
							<button @click="submit" class="submit-btn" :disabled="!isValid">Пополнить</button>
							<button @click="close" class="cancel-btn">Отмена</button>
						</div>

						<p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
					</div>
				</div>
			</div>
		</Transition>
	</Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = defineProps<{
	visible: boolean
}>()

const emit = defineEmits<{
	(e: 'update:visible', value: boolean): void
	(e: 'success', amount: number): void
}>()

const amount = ref<number>(100)
const errorMessage = ref('')

const isValid = computed(() => amount.value >= 50 && !isNaN(amount.value))

const close = () => {
	emit('update:visible', false)
	amount.value = 100
	errorMessage.value = ''
}

const submit = () => {
	if (!isValid.value) {
		errorMessage.value = 'Сумма должна быть не менее 50 ₽'
		return
	}

	emit('success', amount.value)
	close()
}

watch(
	() => props.visible,
	val => {
		if (!val) {
			amount.value = 100
			errorMessage.value = ''
		}
	},
)
</script>
