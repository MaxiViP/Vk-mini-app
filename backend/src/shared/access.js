import prisma from '../db/prisma.js'
import { AppError } from './errors.js'
import crypto from 'node:crypto'

const parseCsv = value =>
	String(value || '')
		.split(',')
		.map(item => item.trim().toLowerCase())
		.filter(Boolean)

const parseAdminIdentities = value =>
	parseCsv(value)
		.map(item => {
			const [provider, providerUserId] = item.split(':')
			if (!provider || !providerUserId) return null
			return { provider, providerUserId }
		})
		.filter(Boolean)

const normalizePhone = value =>
	String(value || '')
		.replace(/\s+/g, '')
		.trim()
		.toLowerCase()
const createDevPhoneUserId = phoneE164 =>
	`dev-phone-${crypto.createHash('sha1').update(phoneE164).digest('hex').slice(0, 12)}`
const hardcodedAdminPhones = ['+79057353580', '+79276494444'].map(normalizePhone)

const adminUserIds = parseCsv(process.env.ADMIN_USER_IDS)
const adminEmails = parseCsv(process.env.ADMIN_EMAILS)
const adminPhones = [...new Set([...parseCsv(process.env.ADMIN_PHONES), ...hardcodedAdminPhones])].filter(Boolean)
const adminIdentities = parseAdminIdentities(process.env.ADMIN_IDENTITIES)

export const isAdminUser = async userId => {
	if (!userId) return false
	if (adminUserIds.includes(String(userId).toLowerCase())) return true
	if (adminPhones.some(phone => createDevPhoneUserId(phone) === String(userId))) return true
	if (adminEmails.length === 0 && adminPhones.length === 0 && adminIdentities.length === 0) return false

	const user = await prisma.user.findUnique({
		where: { id: String(userId) },
		select: { email: true, phoneE164: true },
	})

	if (adminIdentities.length > 0) {
		const identity = await prisma.authIdentity.findFirst({
			where: {
				userId: String(userId),
				OR: adminIdentities.map(item => ({
					provider: item.provider,
					providerUserId: item.providerUserId,
				})),
			},
			select: { id: true },
		})
		if (identity) return true
	}

	return Boolean(
		(user?.email && adminEmails.includes(String(user.email).toLowerCase())) ||
		(user?.phoneE164 && adminPhones.includes(normalizePhone(user.phoneE164))),
	)
}

export const requireAdmin = async (req, _res, next) => {
	try {
		if (!(await isAdminUser(req.user?.id))) {
			throw new AppError('Admin access required', 403)
		}
		next()
	} catch (error) {
		next(error)
	}
}
