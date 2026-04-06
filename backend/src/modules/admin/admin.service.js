import prisma from '../../db/prisma.js'
import logger from '../../config/logger.js'

const buildDateFilter = ({ dateFrom, dateTo }) => {
	if (!dateFrom && !dateTo) return undefined
	return {
		gte: dateFrom ? new Date(dateFrom) : undefined,
		lte: dateTo ? new Date(dateTo) : undefined,
	}
}

const resolveInternalUserId = async rawUserId => {
	if (!rawUserId) return null
	const raw = String(rawUserId)

	if (/^\d+$/.test(raw)) {
		try {
			const user = await prisma.user.findUnique({
				where: { publicId: Number(raw) },
				select: { id: true, publicId: true },
			})
			return user || null
		} catch (error) {
			const message = String(error?.message || '')
			if (message.includes('public_id') || message.includes('publicId')) {
				logger.warn('resolveInternalUserId: publicId lookup unavailable (migration missing)', {
					rawUserId: raw,
				})
				return null
			}
			throw error
		}
	}

	const user = await prisma.user.findUnique({
		where: { id: raw },
		select: { id: true },
	})
	return user ? { id: user.id, publicId: null } : null
}

const applyPagination = ({ limit = 100, cursor = null }) => ({
	take: Math.min(limit, 500),
	skip: cursor ? 1 : 0,
	cursor: cursor ? { id: cursor } : undefined,
	orderBy: { createdAt: 'desc' },
})

export const adminService = {
	async listUsersOverview({ limit = 100, query = null } = {}) {
		const q = query?.toString().trim()
		const buildWhere = ({ insensitive = true, withPublicId = true } = {}) => {
			if (!q) return {}
			const textFilter = value => (insensitive ? { contains: value, mode: 'insensitive' } : { contains: value })
			return {
				OR: [
					{ id: textFilter(q) },
					{ email: textFilter(q) },
					{ firstName: textFilter(q) },
					{ lastName: textFilter(q) },
					...(withPublicId && Number.isFinite(Number(q)) ? [{ publicId: Number(q) }] : []),
				],
			}
		}

		const buildSelect = ({ withPublicId = true } = {}) => ({
			id: true,
			...(withPublicId ? { publicId: true } : {}),
			email: true,
			phoneE164: true,
			firstName: true,
			lastName: true,
			status: true,
			createdAt: true,
			wallets: {
				select: {
					balanceMinor: true,
					currency: true,
				},
			},
		})

		const baseQuery = {
			take: Math.min(limit, 500),
			orderBy: { createdAt: 'desc' },
		}

		try {
			return await prisma.user.findMany({
				...baseQuery,
				where: buildWhere({ insensitive: true, withPublicId: true }),
				select: buildSelect({ withPublicId: true }),
			})
		} catch (error) {
			const message = String(error?.message || '')
			const unsupportedInsensitive = message.includes('Unknown argument `mode`')
			const missingPublicId = message.includes('public_id') || message.includes('publicId')

			if (!unsupportedInsensitive && !missingPublicId) {
				throw error
			}

			logger.warn('Admin users query fallback activated', {
				unsupportedInsensitive,
				missingPublicId,
				query: q || null,
			})

			const rows = await prisma.user.findMany({
				...baseQuery,
				where: buildWhere({
					insensitive: !unsupportedInsensitive,
					withPublicId: !missingPublicId,
				}),
				select: buildSelect({ withPublicId: !missingPublicId }),
			})
			if (missingPublicId) {
				logger.warn('Admin users query returned rows without publicId (migration likely missing)', {
					count: rows.length,
				})
				return rows.map((row, index) => ({
					...row,
					publicId: index + 1,
				}))
			}

			return rows
		}
	},

	async getBusinessEvents({ limit = 100, cursor = null, eventType = null, dateFrom = null, dateTo = null }) {
		return prisma.auditLog.findMany({
			where: {
				action: eventType
					? eventType
					: {
							in: [
								'auth.login.success',
								'auth.login.failed',
								'auth.otp.requested',
								'auth.otp.verified',
								'auth.otp.verify.failed',
								'payment.created',
								'payment.succeeded',
								'payment.failed',
								'payment.canceled',
								'usage.charge',
								'balance.changed',
								'user.status.changed',
							],
						},
				createdAt: buildDateFilter({ dateFrom, dateTo }),
			},
			...applyPagination({ limit, cursor }),
		})
	},

	async getLedger({ userId = null, limit = 100, cursor = null, dateFrom = null, dateTo = null }) {
		const resolvedUser = userId ? await resolveInternalUserId(userId) : null
		if (userId && !resolvedUser) return []

		return prisma.walletLedger.findMany({
			where: {
				...(resolvedUser?.id ? { userId: resolvedUser.id } : {}),
				createdAt: buildDateFilter({ dateFrom, dateTo }),
			},
			...applyPagination({ limit, cursor }),
		})
	},

	async getAuditLog({ userId = null, limit = 100, cursor = null, dateFrom = null, dateTo = null }) {
		const resolvedUser = userId ? await resolveInternalUserId(userId) : null
		if (userId && !resolvedUser) return []

		return prisma.auditLog.findMany({
			where: {
				...(resolvedUser?.id ? { actorUserId: resolvedUser.id } : {}),
				createdAt: buildDateFilter({ dateFrom, dateTo }),
			},
			...applyPagination({ limit, cursor }),
		})
	},

	async getUserActions(userId, { limit = 200, dateFrom = null, dateTo = null } = {}) {
		const resolvedUser = await resolveInternalUserId(userId)
		if (!resolvedUser) return { summary: { userId, found: false }, audit: [], usage: [], ledger: [], payments: [] }

		const internalUserId = resolvedUser.id
		const dateFilter = buildDateFilter({ dateFrom, dateTo })
		const whereBase = {
			createdAt: dateFilter,
		}

		const [audit, usage, ledger, payments, workspace] = await Promise.all([
			prisma.auditLog.findMany({
				where: {
					...whereBase,
					OR: [{ actorUserId: internalUserId }, { entityId: internalUserId }],
				},
				take: Math.min(limit, 1000),
				orderBy: { createdAt: 'desc' },
			}),
			prisma.usageEvent.findMany({
				where: { userId: internalUserId, ...whereBase },
				take: Math.min(limit, 1000),
				orderBy: { createdAt: 'desc' },
			}),
			prisma.walletLedger.findMany({
				where: { userId: internalUserId, ...whereBase },
				take: Math.min(limit, 1000),
				orderBy: { createdAt: 'desc' },
			}),
			prisma.payment.findMany({
				where: { userId: internalUserId, ...whereBase },
				take: Math.min(limit, 1000),
				orderBy: { createdAt: 'desc' },
			}),
			prisma.userWorkspace
				? prisma.userWorkspace.findUnique({ where: { userId: internalUserId } }).catch(() => null)
				: Promise.resolve(null),
		])

		const apiRequests = audit.filter(item => item.action === 'api.request')
		const heartbeats = audit.filter(item => item.action === 'user.activity.heartbeat')
		const activeSeconds = heartbeats.reduce((acc, item) => {
			const raw = item?.afterJson?.activeSeconds
			const n = Number(raw)
			return acc + (Number.isFinite(n) ? n : 0)
		}, 0)

		return {
			summary: {
				userId: internalUserId,
				publicId: resolvedUser.publicId,
				totalAuditEvents: audit.length,
				totalApiRequests: apiRequests.length,
				totalHeartbeats: heartbeats.length,
				totalActiveSeconds: activeSeconds,
				totalUsageRequests: usage.length,
				totalPayments: payments.length,
				lastSeenAt: audit[0]?.createdAt || null,
				walletBalanceMinor: ledger.reduce((sum, entry) => {
					const amount = entry.type === 'debit' ? -entry.amountMinor : entry.amountMinor
					return sum + amount
				}, 0),
				workspace: workspace
					? {
							chatMessages: Array.isArray(workspace.chatHistory) ? workspace.chatHistory.length : 0,
							notesCount: Array.isArray(workspace.notesPayload?.notes) ? workspace.notesPayload.notes.length : 0,
							updatedAt: workspace.updatedAt,
						}
					: null,
			},
			audit,
			usage,
			ledger,
			payments,
		}
	},

	async getUserTimeline({ userId, limit = 100, dateFrom = null, dateTo = null }) {
		const resolvedUser = await resolveInternalUserId(userId)
		if (!resolvedUser) return { events: [], ledger: [], usage: [] }

		const internalUserId = resolvedUser.id
		const dateFilter = buildDateFilter({ dateFrom, dateTo })
		const [events, ledger, usage] = await Promise.all([
			prisma.auditLog.findMany({
				where: {
					OR: [{ actorUserId: internalUserId }, { entityId: internalUserId }],
					createdAt: dateFilter,
				},
				take: Math.min(limit, 500),
				orderBy: { createdAt: 'desc' },
			}),
			prisma.walletLedger.findMany({
				where: { userId: internalUserId, createdAt: dateFilter },
				take: Math.min(limit, 500),
				orderBy: { createdAt: 'desc' },
			}),
			prisma.usageEvent.findMany({
				where: { userId: internalUserId, createdAt: dateFilter },
				take: Math.min(limit, 500),
				orderBy: { createdAt: 'desc' },
			}),
		])

		return { events, ledger, usage }
	},

	async getMetrics() {
		const [usersCount, payingUsersCount, totalRevenue, totalCost, active7, active30, usersWithPayment] =
			await Promise.all([
				prisma.user.count(),
				prisma.payment.groupBy({ by: ['userId'], where: { status: 'succeeded' } }).then(rows => rows.length),
				prisma.payment.aggregate({ _sum: { amountMinor: true }, where: { status: 'succeeded' } }),
				prisma.usageEvent.aggregate({ _sum: { costMinor: true } }),
				prisma.usageEvent
					.groupBy({
						by: ['userId'],
						where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 3600 * 1000) } },
					})
					.then(rows => rows.length),
				prisma.usageEvent
					.groupBy({
						by: ['userId'],
						where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 3600 * 1000) } },
					})
					.then(rows => rows.length),
				prisma.user.count({ where: { payments: { some: { status: 'succeeded' } } } }),
			])

		const revenueMinor = totalRevenue._sum.amountMinor || 0
		const costMinor = totalCost._sum.costMinor || 0
		const arpuMinor = usersCount > 0 ? Math.round(revenueMinor / usersCount) : 0
		const churn7 = usersCount > 0 ? Number(((usersCount - active7) / usersCount).toFixed(4)) : 0
		const churn30 = usersCount > 0 ? Number(((usersCount - active30) / usersCount).toFixed(4)) : 0
		const ltvMinor = churn30 > 0 ? Math.round(arpuMinor / churn30) : arpuMinor
		const grossMarginMinor = revenueMinor - costMinor
		const conversionRegistrationToFirstPayment = usersCount > 0 ? Number((usersWithPayment / usersCount).toFixed(4)) : 0

		const marketingSpendMinor = Number(process.env.MARKETING_SPEND_MINOR || 0)
		const cacMinor = usersWithPayment > 0 ? Math.round(marketingSpendMinor / usersWithPayment) : marketingSpendMinor

		return {
			cacMinor,
			arpuMinor,
			ltvMinor,
			costPerRequestMinor: usersCount > 0 ? Math.round(costMinor / Math.max(active30, 1)) : 0,
			grossMarginMinor,
			churn7,
			churn30,
			conversionRegistrationToFirstPayment,
			revenueMinor,
			costMinor,
			usersCount,
			payingUsersCount,
		}
	},
}
