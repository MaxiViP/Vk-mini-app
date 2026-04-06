import prisma from '../db/prisma.js'

export const logBusinessEvent = async ({
	eventType,
	actorUserId = null,
	entityType = 'system',
	entityId = 'n/a',
	payload = {},
	ip = null,
	userAgent = null,
}) => {
	try {
		await prisma.auditLog.create({
			data: {
				actorUserId,
				entityType,
				entityId,
				action: eventType,
				beforeJson: null,
				afterJson: payload,
				ip,
				userAgent,
			},
		})
	} catch {
		// observability should never break request flow
	}
}

export const logAuditChange = async ({
	actorUserId = null,
	entityType,
	entityId,
	action,
	before = null,
	after = null,
	ip = null,
	userAgent = null,
}) => {
	try {
		await prisma.auditLog.create({
			data: {
				actorUserId,
				entityType,
				entityId,
				action,
				beforeJson: before,
				afterJson: after,
				ip,
				userAgent,
			},
		})
	} catch {
		// observability should never break request flow
	}
}
