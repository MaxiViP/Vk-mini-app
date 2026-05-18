<template>
	<button class="pill-btn profile-trigger" @click="$emit('click')" :title="fullName">
		<template v-if="isMobile">
			<img v-if="avatarUrl" :src="avatarUrl" alt="Профиль" class="profile-trigger__avatar" />
			<span v-else class="profile-trigger__avatar profile-trigger__avatar--fallback">
				{{ initials }}
			</span>
		</template>

		<template v-else>
			<span class="profile-trigger__text">{{ fullName }}</span>
		</template>

		<span
			v-if="isAdmin"
			class="profile-trigger__admin"
			role="button"
			tabindex="0"
			title="Админка"
			aria-label="Открыть админку"
			@click.stop="$emit('admin-click')"
			@keydown.enter.stop.prevent="$emit('admin-click')"
			@keydown.space.stop.prevent="$emit('admin-click')"
		>
			A
		</span>
	</button>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useUserStore } from '../../stores/user'

defineProps<{
	isAdmin?: boolean
}>()

defineEmits<{
	(e: 'click'): void
	(e: 'admin-click'): void
}>()

const userStore = useUserStore()

// --- responsive ---
const isMobile = ref(window.innerWidth <= 640)

const sync = () => {
	isMobile.value = window.innerWidth <= 640
}

// --- user data ---
const fullName = computed(() => {
	if (!userStore.user) return 'Профиль'
	return `${userStore.user.firstName} ${userStore.user.lastName || ''}`.trim()
})

const avatarUrl = computed(() => {
	return userStore.user?.photo_200 || userStore.user?.photo_100 || userStore.user?.avatarUrl || ''
})

const initials = computed(() => {
	if (!userStore.user) return 'П'
	const first = userStore.user.firstName?.[0] || ''
	const last = userStore.user.lastName?.[0] || ''
	return `${first}${last}`.toUpperCase() || 'П'
})

// --- lifecycle ---
onMounted(() => {
	sync()
	window.addEventListener('resize', sync)
	window.addEventListener('orientationchange', sync)
})

onUnmounted(() => {
	window.removeEventListener('resize', sync)
	window.removeEventListener('orientationchange', sync)
})
</script>
