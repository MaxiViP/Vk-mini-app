<template>
	<div class="admin-panel">
		<h3>Мониторинг (Admin)</h3>

		<div class="filters">
			<input v-model="userId" placeholder="User ID (UUID или publicId)" />
			<input v-model="usersQuery" placeholder="Поиск пользователя" />
			<input v-model="eventType" placeholder="Event type" />
			<input v-model="dateFrom" type="datetime-local" />
			<input v-model="dateTo" type="datetime-local" />
			<button @click="handleRefreshClick" :disabled="loading">Обновить</button>
		</div>

		<section class="users-table-wrap">
			<h4>Пользователи</h4>
			<p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>
			<div class="table-scroll">
				<table class="users-table">
					<thead>
						<tr>
							<th>UUID</th>
							<th>Имя</th>
							<th>Email</th>
							<th>Телефон</th>
							<th>Статус</th>
							<th>Баланс</th>
							<th>Создан</th>
						</tr>
					</thead>
					<tbody>
						<tr v-for="user in users" :key="user.id" @click="selectUser(user)">
							<td class="mono">{{ user.id }}</td>
							<td>{{ formatName(user) }}</td>
							<td>{{ user.email || '-' }}</td>
							<td>{{ user.phoneE164 || '-' }}</td>
							<td>{{ user.status }}</td>
							<td>{{ formatBalance(user.wallet?.balanceMinor, user.wallet?.currency) }}</td>
							<td>{{ formatDate(user.createdAt) }}</td>
						</tr>
					</tbody>
				</table>
			</div>
		</section>

		<div class="metrics">
			<h4>Метрики revenue</h4>
			<pre>{{ pretty(metrics) }}</pre>
		</div>

		<div class="metrics" v-if="userActions">
			<h4>Действия пользователя (summary)</h4>
			<pre>{{ pretty(userActions.summary) }}</pre>
		</div>

		<div class="grid">
			<section>
				<h4>Бизнес-события</h4>
				<pre>{{ pretty(events) }}</pre>
			</section>
			<section>
				<h4>Ledger</h4>
				<pre>{{ pretty(ledger) }}</pre>
			</section>
			<section>
				<h4>Audit log</h4>
				<pre>{{ pretty(audit) }}</pre>
			</section>
			<section v-if="userActions">
				<h4>Timeline действий пользователя</h4>
				<pre>{{ pretty(userActions) }}</pre>
			</section>
		</div>
	</div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import axios from 'axios'
import type { AxiosError } from 'axios'

import { useUserStore } from '../../stores/user'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

interface AdminUserRow {
	id: string
	email: string | null
	phoneE164: string | null
	firstName: string | null
	lastName: string | null
	status: string
	createdAt: string
	wallet: {
		balanceMinor: number
		currency: string
	} | null
}

const userStore = useUserStore()
const loading = ref(false)
const errorMessage = ref('')
const events = ref<unknown[]>([])
const ledger = ref<unknown[]>([])
const audit = ref<unknown[]>([])
const metrics = ref<Record<string, unknown>>({})
const userActions = ref<Record<string, unknown> | null>(null)
const users = ref<AdminUserRow[]>([])

const userId = ref('')
const usersQuery = ref('')
const eventType = ref('')
const dateFrom = ref('')
const dateTo = ref('')
const AUTO_REFRESH_MS = import.meta.env.DEV ? 60000 : 15000
const AUTO_REFRESH_ENABLED = !import.meta.env.DEV
const RATE_LIMIT_COOLDOWN_MS = 30000
let refreshTimer: number | null = null
let rateLimitedUntil = 0

const authHeaders = () => ({
	Authorization: `Bearer ${userStore.token}`,
})

const toIso = (value: string) => (value ? new Date(value).toISOString() : undefined)
const normalizedUserId = () => {
	const value = userId.value?.trim()
	if (!value || value === 'null' || value === 'undefined') return undefined
	return value
}

const resolveAdminErrorMessage = (error: unknown) => {
	const axiosError = error as AxiosError<{ message?: string; details?: { code?: string } }>
	const apiMessage = axiosError.response?.data?.message
	const errorCode = axiosError.response?.data?.details?.code

	if (errorCode === 'DATABASE_UNAVAILABLE') {
		return 'Локальный backend не может подключиться к MySQL. Пользователи из серверной базы появятся только после деплоя на сервер или при запуске локальной БД.'
	}

	if (apiMessage) {
		return `Админ-панель не загрузилась: ${apiMessage}`
	}

	return 'Не удалось загрузить данные админ-панели. Проверьте backend-логи.'
}

const isRateLimitError = (error: unknown) => {
	const axiosError = error as AxiosError
	return axiosError.response?.status === 429
}

const loadUsers = async () => {
	const usersRes = await axios.get<AdminUserRow[]>(`${API_BASE_URL}/api/admin/users`, {
		headers: authHeaders(),
		params: { limit: 100, query: usersQuery.value || undefined },
	})
	users.value = usersRes.data
}

const loadAll = async ({ usersOnly = false } = {}) => {
	if (loading.value) return
	if (Date.now() < rateLimitedUntil) return

	loading.value = true
	errorMessage.value = ''
	try {
		const selectedUserId = normalizedUserId()
		const params = {
			...(eventType.value ? { eventType: eventType.value } : {}),
			...(dateFrom.value ? { dateFrom: toIso(dateFrom.value) } : {}),
			...(dateTo.value ? { dateTo: toIso(dateTo.value) } : {}),
			limit: 100,
		}

		await loadUsers()
		if (usersOnly) return

		const [eventsRes, ledgerRes, auditRes, metricsRes] = await Promise.all([
			axios.get(`${API_BASE_URL}/api/admin/events`, { headers: authHeaders(), params }),
			axios.get(`${API_BASE_URL}/api/admin/ledger`, { headers: authHeaders(), params }),
			axios.get(`${API_BASE_URL}/api/admin/audit`, { headers: authHeaders(), params }),
			axios.get(`${API_BASE_URL}/api/admin/metrics`, { headers: authHeaders() }),
		])
		events.value = eventsRes.data
		ledger.value = ledgerRes.data
		audit.value = auditRes.data
		metrics.value = metricsRes.data

		if (selectedUserId) {
			const userActionsRes = await axios.get(`${API_BASE_URL}/api/admin/users/${selectedUserId}/actions`, {
				headers: authHeaders(),
				params: {
					...(dateFrom.value ? { dateFrom: toIso(dateFrom.value) } : {}),
					...(dateTo.value ? { dateTo: toIso(dateTo.value) } : {}),
					limit: 100,
				},
			})
			userActions.value = userActionsRes.data
		} else {
			userActions.value = null
		}
	} catch (error) {
		console.error('Admin panel load failed', error)
		if (isRateLimitError(error)) {
			rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS
			errorMessage.value = `Слишком много запросов к админ API (429). Автообновление поставлено на паузу на ${Math.round(
				RATE_LIMIT_COOLDOWN_MS / 1000,
			)} сек.`
		} else {
			errorMessage.value = resolveAdminErrorMessage(error)
		}
	} finally {
		loading.value = false
	}
}

const selectUser = (user: AdminUserRow) => {
	userId.value = user.id
	void loadAll()
}

const formatDate = (value: string) => new Date(value).toLocaleString()

const formatBalance = (minor?: number, currency?: string) => {
	if (typeof minor !== 'number') return '-'
	return `${(minor / 100).toFixed(2)} ${currency || 'RUB'}`
}

const formatName = (user: AdminUserRow) => {
	const name = [user.firstName, user.lastName].filter(Boolean).join(' ')
	return name || '-'
}

const pretty = (data: unknown) => JSON.stringify(data, null, 2)

const handleRefreshClick = async () => {
	await loadAll()
}

onMounted(loadAll)

onMounted(() => {
	if (!AUTO_REFRESH_ENABLED) return
	refreshTimer = window.setInterval(() => {
		void loadAll({ usersOnly: true })
	}, AUTO_REFRESH_MS)
})

onUnmounted(() => {
	if (refreshTimer) {
		window.clearInterval(refreshTimer)
		refreshTimer = null
	}
})
</script>

<style scoped>
.admin-panel {
	display: flex;
	flex-direction: column;
	gap: 12px;
	width: min(1200px, 100%);
	max-height: min(calc(var(--viewport-height) - 48px), 900px);
	overflow-y: auto;
	overflow-x: hidden;
	padding-right: 4px;
	box-sizing: border-box;
}

.filters {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
	gap: 8px;
	position: sticky;
	top: 0;
	z-index: 2;
	background: var(--color-panel-bg-strong);
	padding: 8px;
	border-radius: 10px;
}

.users-table-wrap {
	background: var(--color-panel-bg-strong);
	padding: 10px;
	border-radius: 10px;
}

.table-scroll {
	overflow: auto;
	max-height: 260px;
}

.users-table {
	width: 100%;
	border-collapse: collapse;
	font-size: 12px;
	color: var(--color-text);
}

.users-table th,
.users-table td {
	border-bottom: 1px solid var(--color-panel-border);
	padding: 6px;
	text-align: left;
	white-space: nowrap;
}

.users-table tr:hover {
	background: var(--color-control-bg-hover);
	cursor: pointer;
}

.mono {
	font-family: monospace;
}

.error-text {
	color: var(--color-danger);
	margin: 4px 0 10px;
	font-size: 13px;
}

input,
button {
	padding: 8px;
	border: 1px solid var(--color-border);
	border-radius: 8px;
	background: var(--color-surface);
	color: var(--color-text);
}

.grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 12px;
}

pre {
	max-height: 260px;
	overflow: auto;
	background: var(--color-code-block-bg);
	color: var(--color-text);
	padding: 10px;
	border-radius: 10px;
	font-size: 12px;
}

@media (max-width: 900px) {
	.grid {
		grid-template-columns: 1fr;
	}

	.users-table {
		font-size: 11px;
	}
}

@media (max-width: 560px) {
	.admin-panel {
		max-height: min(calc(var(--viewport-height) - 20px), 100%);
		padding-right: 0;
	}

	.filters {
		grid-template-columns: 1fr;
		padding: 10px;
	}

	.users-table th,
	.users-table td {
		padding: 5px;
	}

	pre {
		font-size: 11px;
		padding: 8px;
	}
}
</style>
