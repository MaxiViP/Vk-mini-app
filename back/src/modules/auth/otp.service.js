import crypto from 'node:crypto'
import prisma from '../../db/prisma.js'
import { AppError } from '../../shared/errors.js'
import { authService } from './auth.service.js'
import { issueDevAuthResult } from './dev-session.store.js'

const OTP_TTL_SECONDS = 5 * 60
const OTP_MAX_ATTEMPTS = 5
const OTP_RESEND_COOLDOWN_SEC = process.env.NODE_ENV === 'production' ? 30 : 5

const phoneSendTimestamps = new Map()
const memoryChallenges = new Map()

const normalizePhone = rawPhone => {
	const raw = String(rawPhone || '').trim()
	const hasPlus = raw.startsWith('+')
	const digits = raw.replace(/\D/g, '')
	if (!digits) return ''
	return `${hasPlus ? '+' : ''}${digits}`
}
const hashOtp = otp => crypto.createHash('sha256').update(otp).digest('hex')
const generateOtp = () => `${Math.floor(100000 + Math.random() * 900000)}`
const createMemoryChallengeId = () => `mem_${crypto.randomUUID()}`
const createDevUserId = phoneE164 =>
	`dev-phone-${crypto.createHash('sha1').update(phoneE164).digest('hex').slice(0, 12)}`
const isAdminPhone = phoneE164 => normalizePhone(phoneE164) === normalizePhone('+79057353580')
const shouldExposeDebugOtp = process.env.NODE_ENV !== 'production' || process.env.ALLOW_DEBUG_OTP === 'true'

const isOtpStorageUnavailable = error => {
	const message = String(error?.message || '').toLowerCase()
	return (
		error?.code === 'P1001' ||
		error?.code === 'P2021' ||
		error?.code === 'P2022' ||
		message.includes("can't reach database server") ||
		message.includes('connection refused') ||
		message.includes('econnrefused') ||
		message.includes('otp_codes') ||
		message.includes('otpcode') ||
		message.includes('prisma client is not initialized') ||
		(message.includes('cannot read properties of undefined') && message.includes('create')) ||
		(message.includes('cannot read properties of undefined') && message.includes('findunique')) ||
		(message.includes('cannot read properties of undefined') && message.includes('update'))
	)
}

const validateOtpRecord = otpRecord => {
	if (!otpRecord) throw new AppError('Challenge not found', 404)
	if (otpRecord.consumedAt) throw new AppError('Challenge already used', 400)
	if (otpRecord.expiresAt < new Date()) throw new AppError('OTP expired', 400)
	if (otpRecord.attempts >= OTP_MAX_ATTEMPTS) throw new AppError('OTP attempts exceeded', 429)
}

const createInMemoryChallenge = ({ phoneE164, codeHash, expiresAt, challengeId = createMemoryChallengeId() }) => {
	memoryChallenges.set(challengeId, {
		id: challengeId,
		phoneE164,
		codeHash,
		expiresAt,
		attempts: 0,
		consumedAt: null,
	})
	return challengeId
}

const issueDevPhoneAuthResult = phoneE164 => {
	const user = {
		id: createDevUserId(phoneE164),
		email: null,
		phoneE164,
		firstName: 'User',
		lastName: 'Phone',
		avatarUrl: null,
		status: 'active',
		isAdmin: isAdminPhone(phoneE164),
	}

	return issueDevAuthResult(user)
}

export const otpService = {
	async sendOtp({ phone }) {
		const phoneE164 = normalizePhone(phone || '')
		if (!phoneE164) throw new AppError('phone is required', 400)

		const now = Date.now()
		const lastSent = phoneSendTimestamps.get(phoneE164) || 0
		if (now - lastSent < OTP_RESEND_COOLDOWN_SEC * 1000) {
			throw new AppError(`OTP resend cooldown ${OTP_RESEND_COOLDOWN_SEC}s`, 429)
		}

		const code = generateOtp()
		const codeHash = hashOtp(code)
		const expiresAt = new Date(now + OTP_TTL_SECONDS * 1000)

		try {
			const challenge = await prisma.otpCode.create({
				data: {
					phoneE164,
					codeHash,
					expiresAt,
				},
			})

			phoneSendTimestamps.set(phoneE164, now)
			createInMemoryChallenge({
				phoneE164,
				codeHash,
				expiresAt,
				challengeId: challenge.id,
			})

			return {
				challengeId: challenge.id,
				expiresInSec: OTP_TTL_SECONDS,
				debugCode: shouldExposeDebugOtp ? code : undefined,
			}
		} catch (error) {
			if (error instanceof AppError) throw error

			const challengeId = createInMemoryChallenge({
				phoneE164,
				codeHash,
				expiresAt,
			})
			phoneSendTimestamps.set(phoneE164, now)

			return {
				challengeId,
				expiresInSec: OTP_TTL_SECONDS,
				debugCode: shouldExposeDebugOtp ? code : undefined,
			}
		}
	},

	async verifyOtp({ challengeId, code, userAgent, ip }) {
		if (!challengeId || !code) throw new AppError('challengeId and code are required', 400)

		if (String(challengeId).startsWith('mem_')) {
			const otpRecord = memoryChallenges.get(challengeId)
			validateOtpRecord(otpRecord)

			const isValid = hashOtp(code) === otpRecord.codeHash
			if (!isValid) {
				otpRecord.attempts += 1
				memoryChallenges.set(challengeId, otpRecord)
				throw new AppError('Invalid OTP code', 400)
			}

			otpRecord.consumedAt = new Date()
			memoryChallenges.set(challengeId, otpRecord)

			try {
				const user = await authService.upsertPhoneUser({ phoneE164: otpRecord.phoneE164 })
				return await authService.issueTokens({ user, userAgent, ip })
			} catch (error) {
				if (!isOtpStorageUnavailable(error)) throw error
				return issueDevPhoneAuthResult(otpRecord.phoneE164)
			}
		}

		let otpRecord = null
		try {
			otpRecord = await prisma.otpCode.findUnique({ where: { id: challengeId } })
		} catch (error) {
			if (error instanceof AppError) throw error
			otpRecord = memoryChallenges.get(challengeId) || null
		}
		validateOtpRecord(otpRecord)

		const isValid = hashOtp(code) === otpRecord.codeHash
		if (!isValid) {
			if (String(otpRecord.id).startsWith('mem_') || memoryChallenges.has(otpRecord.id)) {
				otpRecord.attempts += 1
				memoryChallenges.set(otpRecord.id, otpRecord)
			} else {
				try {
					await prisma.otpCode.update({
						where: { id: otpRecord.id },
						data: { attempts: { increment: 1 } },
					})
				} catch {
					otpRecord.attempts += 1
					memoryChallenges.set(otpRecord.id, otpRecord)
				}
			}
			throw new AppError('Invalid OTP code', 400)
		}

		if (String(otpRecord.id).startsWith('mem_') || memoryChallenges.has(otpRecord.id)) {
			otpRecord.consumedAt = new Date()
			memoryChallenges.set(otpRecord.id, otpRecord)
		} else {
			try {
				await prisma.otpCode.update({
					where: { id: otpRecord.id },
					data: { consumedAt: new Date() },
				})
			} catch {
				otpRecord.consumedAt = new Date()
				memoryChallenges.set(otpRecord.id, otpRecord)
			}
		}

		try {
			const user = await authService.upsertPhoneUser({ phoneE164: otpRecord.phoneE164 })
			return await authService.issueTokens({ user, userAgent, ip })
		} catch (error) {
			if (!isOtpStorageUnavailable(error) && !(error instanceof TypeError)) throw error
			return issueDevPhoneAuthResult(otpRecord.phoneE164)
		}
	},
}
