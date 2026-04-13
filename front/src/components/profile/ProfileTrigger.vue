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
	</button>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useUserStore } from '../../stores/user'

defineEmits<{
	(e: 'click'): void
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

<style scoped>
.profile-trigger {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-width: 44px;
	min-height: 44px;
}

/* текст (desktop) */
.profile-trigger__text {
	display: block;
	max-width: 160px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

/* аватар (mobile) */
.profile-trigger__avatar {
	width: 28px;
	height: 28px;
	border-radius: 50%;
	object-fit: cover;
	display: block;
}

/* fallback инициалы */
.profile-trigger__avatar--fallback {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	background: rgba(255, 255, 255, 0.14);
	color: #fff;
	font-size: 12px;
	font-weight: 700;
}
</style>
