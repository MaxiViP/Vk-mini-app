import prisma from '../../db/prisma.js'

const buildDateFilter = ({ dateFrom, dateTo }) => {
	if (!dateFrom && !dateTo) return undefined
	return {
		gte: dateFrom ? new Date(dateFrom) : undefined,
		lte: dateTo ? new Date(dateTo) : undefined,
	}
}

const applyPagination = ({ limit = 100, cursor = null }) => ({
	take: Math.min(limit, 500),
	skip: cursor ? 1 : 0,
	cursor: cursor ? { id: cursor } : undefined,
	orderBy: { createdAt: 'desc' },
})

export const adminService = {
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
		return prisma.walletLedger.findMany({
			where: {
				...(userId ? { userId } : {}),
				createdAt: buildDateFilter({ dateFrom, dateTo }),
			},
			...applyPagination({ limit, cursor }),
		})
	},

	async getAuditLog({ userId = null, limit = 100, cursor = null, dateFrom = null, dateTo = null }) {
		return prisma.auditLog.findMany({
			where: {
				...(userId ? { actorUserId: userId } : {}),
				createdAt: buildDateFilter({ dateFrom, dateTo }),
			},
			...applyPagination({ limit, cursor }),
		})
	},

	async getUserTimeline({ userId, limit = 100, dateFrom = null, dateTo = null }) {
		const dateFilter = buildDateFilter({ dateFrom, dateTo })
		const [events, ledger, usage] = await Promise.all([
			prisma.auditLog.findMany({
				where: {
					OR: [{ actorUserId: userId }, { entityId: userId }],
					createdAt: dateFilter,
				},
				take: Math.min(limit, 500),
				orderBy: { createdAt: 'desc' },
			}),
			prisma.walletLedger.findMany({
				where: { userId, createdAt: dateFilter },
				take: Math.min(limit, 500),
				orderBy: { createdAt: 'desc' },
			}),
			prisma.usageEvent.findMany({
				where: { userId, createdAt: dateFilter },
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
