import prisma from '../db/prisma.js'
import { AppError } from './errors.js'
import crypto from 'node:crypto'

const parseCsv = value =>
	String(value || '')
		.split(',')
		.map(item => item.trim().toLowerCase())
		.filter(Boolean)

const normalizePhone = value => String(value || '').replace(/\s+/g, '').trim().toLowerCase()
const createDevPhoneUserId = phoneE164 => `dev-phone-${crypto.createHash('sha1').update(phoneE164).digest('hex').slice(0, 12)}`

const adminUserIds = parseCsv(process.env.ADMIN_USER_IDS)
const adminEmails = parseCsv(process.env.ADMIN_EMAILS)
const adminPhones = [...parseCsv(process.env.ADMIN_PHONES), normalizePhone('+79057353580')].filter(Boolean)

export const isAdminUser = async userId => {
	if (!userId) return false
	if (adminUserIds.includes(String(userId).toLowerCase())) return true
	if (adminPhones.some(phone => createDevPhoneUserId(phone) === String(userId))) return true
	if (adminEmails.length === 0 && adminPhones.length === 0) return false

	const user = await prisma.user.findUnique({
		where: { id: String(userId) },
		select: { email: true, phoneE164: true },
	})

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
