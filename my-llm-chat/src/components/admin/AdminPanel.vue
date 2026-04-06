<template>
	<div class="admin-panel">
		<h3>Мониторинг (Admin)</h3>

		<div class="filters">
			<input v-model="userId" placeholder="User ID" />
			<input v-model="eventType" placeholder="Event type" />
			<input v-model="dateFrom" type="datetime-local" />
			<input v-model="dateTo" type="datetime-local" />
			<button @click="loadAll" :disabled="loading">Обновить</button>
		</div>

		<div class="metrics">
			<h4>Метрики revenue</h4>
			<pre>{{ pretty(metrics) }}</pre>
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
		</div>
	</div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import axios from 'axios'

import { useUserStore } from '../../stores/user'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

const userStore = useUserStore()
const loading = ref(false)
const events = ref<unknown[]>([])
const ledger = ref<unknown[]>([])
const audit = ref<unknown[]>([])
const metrics = ref<Record<string, unknown>>({})

const userId = ref('')
const eventType = ref('')
const dateFrom = ref('')
const dateTo = ref('')

const authHeaders = () => ({
	Authorization: `Bearer ${userStore.token}`,
	'X-Admin-Secret': import.meta.env.VITE_ADMIN_MONITOR_SECRET || '',
})

const toIso = (value: string) => (value ? new Date(value).toISOString() : undefined)

const loadAll = async () => {
	loading.value = true
	try {
		const params = {
			...(userId.value ? { userId: userId.value } : {}),
			...(eventType.value ? { eventType: eventType.value } : {}),
			...(dateFrom.value ? { dateFrom: toIso(dateFrom.value) } : {}),
			...(dateTo.value ? { dateTo: toIso(dateTo.value) } : {}),
			limit: 200,
		}

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
	} finally {
		loading.value = false
	}
}

const pretty = (data: unknown) => JSON.stringify(data, null, 2)

onMounted(loadAll)
</script>

<style scoped>
.admin-panel {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.filters {
	display: grid;
	grid-template-columns: repeat(5, minmax(120px, 1fr));
	gap: 8px;
}

input,
button {
	padding: 8px;
	border: 1px solid #cbd5e1;
	border-radius: 8px;
}

.grid {
	display: grid;
	grid-template-columns: 1fr;
	gap: 12px;
}

pre {
	max-height: 260px;
	overflow: auto;
	background: #0f172a;
	color: #e2e8f0;
	padding: 10px;
	border-radius: 10px;
	font-size: 12px;
}
</style>