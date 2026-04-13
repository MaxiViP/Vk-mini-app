import prisma from '../../db/prisma.js'
import { AppError } from '../../shared/errors.js'
import { logAuditChange, logBusinessEvent } from '../../shared/observability.js'

const isUserStorageUnavailable = error => {
	const message = String(error?.message || '').toLowerCase()
	return (
		error?.code === 'P1001' ||
		error?.code === 'P2021' ||
		error?.code === 'P2022' ||
		message.includes("can't reach database server") ||
		message.includes('connection refused') ||
		message.includes('econnrefused') ||
		message.includes('prisma client is not initialized')
	)
}

const buildDevProfile = authContext => ({
	id: authContext.id,
	email: null,
	phoneE164: authContext.phoneE164 || null,
	firstName: authContext.firstName || 'User',
	lastName: authContext.lastName || 'Phone',
	avatarUrl: authContext.avatarUrl || null,
	status: authContext.status || 'active',
	isAdmin: Boolean(authContext.isAdmin),
	wallet: {
		balanceMinor: 0,
		currency: 'RUB',
	},
	subscriptions: [],
})

export const userService = {
	async getProfile(userOrContext) {
		const authContext =
			typeof userOrContext === 'string'
				? { id: userOrContext }
				: {
						id: userOrContext?.id,
						status: userOrContext?.status,
						phoneE164: userOrContext?.phoneE164,
						firstName: userOrContext?.firstName,
						lastName: userOrContext?.lastName,
						avatarUrl: userOrContext?.avatarUrl,
						isAdmin: userOrContext?.isAdmin,
					}

		try {
			const user = await prisma.user.findUnique({
				where: { id: authContext.id },
				include: {
					wallet: true,
					subscriptions: {
						where: { status: 'active' },
						include: { plan: true },
					},
				},
			})

			if (!user) {
				if (String(authContext.id || '').startsWith('dev-phone-')) {
					return buildDevProfile(authContext)
				}
				throw new AppError('User not found', 404)
			}

			return {
				...user,
				isAdmin: Boolean(authContext.isAdmin),
			}
		} catch (error) {
			if (String(authContext.id || '').startsWith('dev-phone-') && isUserStorageUnavailable(error)) {
				return buildDevProfile(authContext)
			}
			throw error
		}
	},

	async trackActivity(userId, payload = {}, actor = {}) {
		const normalized = {
			sessionId: typeof payload.sessionId === 'string' ? payload.sessionId : 'unknown',
			activeSeconds: Number.isFinite(Number(payload.activeSeconds)) ? Math.max(0, Number(payload.activeSeconds)) : 0,
			page: typeof payload.page === 'string' ? payload.page : 'unknown',
			requestsCount: Number.isFinite(Number(payload.requestsCount)) ? Math.max(0, Number(payload.requestsCount)) : 0,
			notesMutations: Number.isFinite(Number(payload.notesMutations)) ? Math.max(0, Number(payload.notesMutations)) : 0,
			chatMessagesSent: Number.isFinite(Number(payload.chatMessagesSent))
				? Math.max(0, Number(payload.chatMessagesSent))
				: 0,
			timestamp: new Date().toISOString(),
		}

		await logBusinessEvent({
			eventType: 'user.activity.heartbeat',
			actorUserId: userId,
			entityType: 'user_activity',
			entityId: userId,
			payload: normalized,
			ip: actor.ip || null,
			userAgent: actor.userAgent || null,
		})

		return { ok: true }
	},

	async listUsers({ limit = 20, cursor = null } = {}) {
		return prisma.user.findMany({
			take: Math.min(limit, 100),
			skip: cursor ? 1 : 0,
			cursor: cursor ? { id: cursor } : undefined,
			orderBy: { createdAt: 'desc' },
		})
	},

	async createUser(payload, actor = {}) {
		const user = await prisma.user.create({ data: payload })
		await logAuditChange({
			actorUserId: actor.actorUserId || null,
			entityType: 'user',
			entityId: user.id,
			action: 'user.create',
			before: null,
			after: user,
			ip: actor.ip || null,
			userAgent: actor.userAgent || null,
		})
		return user
	},

	async updateUser(userId, payload, actor = {}) {
		const before = await prisma.user.findUnique({ where: { id: userId } })
		if (!before) throw new AppError('User not found', 404)

		const updated = await prisma.user.update({
			where: { id: userId },
			data: payload,
		})

		await logAuditChange({
			actorUserId: actor.actorUserId || null,
			entityType: 'user',
			entityId: userId,
			action: 'user.update',
			before,
			after: updated,
			ip: actor.ip || null,
			userAgent: actor.userAgent || null,
		})

		return updated
	},

	async deleteUser(userId, actor = {}) {
		const before = await prisma.user.findUnique({ where: { id: userId } })
		if (!before) throw new AppError('User not found', 404)

		const deleted = await prisma.user.update({
			where: { id: userId },
			data: { status: 'deleted' },
		})

		await logAuditChange({
			actorUserId: actor.actorUserId || null,
			entityType: 'user',
			entityId: userId,
			action: 'user.delete',
			before,
			after: deleted,
			ip: actor.ip || null,
			userAgent: actor.userAgent || null,
		})
		await logBusinessEvent({
			eventType: 'user.status.changed',
			actorUserId: actor.actorUserId || null,
			entityType: 'user',
			entityId: userId,
			payload: { from: before.status, to: deleted.status },
			ip: actor.ip || null,
			userAgent: actor.userAgent || null,
		})

		return deleted
	},
}
