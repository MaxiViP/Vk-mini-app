import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'

import prisma from '../../db/prisma.js'
import env from '../../config/env.js'
import { AppError } from '../../shared/errors.js'
import { authService } from './auth.service.js'

const OTP_TTL_SECONDS = 5 * 60
const OTP_MAX_ATTEMPTS = 5
const OTP_RESEND_COOLDOWN_SEC = process.env.NODE_ENV === 'production' ? 30 : 5

const phoneSendTimestamps = new Map()
const memoryChallenges = new Map()

const normalizePhone = rawPhone => rawPhone.replace(/\s+/g, '').trim()
const hashOtp = otp => crypto.createHash('sha256').update(otp).digest('hex')
const generateOtp = () => `${Math.floor(100000 + Math.random() * 900000)}`
const createMemoryChallengeId = () => `mem_${crypto.randomUUID()}`
const createDevUserId = phoneE164 => `dev-phone-${crypto.createHash('sha1').update(phoneE164).digest('hex').slice(0, 12)}`
const isAdminPhone = phoneE164 => normalizePhone(phoneE164) === normalizePhone('+79057353580')

const isDatabaseUnavailable = error => {
	const message = String(error?.message || '').toLowerCase()
	return message.includes("can't reach database server") || error?.code === 'P1001'
}

const validateOtpRecord = otpRecord => {
	if (!otpRecord) throw new AppError('Challenge not found', 404)
	if (otpRecord.consumedAt) throw new AppError('Challenge already used', 400)
	if (otpRecord.expiresAt < new Date()) throw new AppError('OTP expired', 400)
	if (otpRecord.attempts >= OTP_MAX_ATTEMPTS) throw new AppError('OTP attempts exceeded', 429)
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

	return {
		accessToken: jwt.sign({ sub: user.id, status: user.status }, env.jwtSecret, {
			expiresIn: '15m',
		}),
		refreshToken: `dev-refresh-${crypto.randomUUID()}`,
		refreshTokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
		user,
	}
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

			return {
				challengeId: challenge.id,
				expiresInSec: OTP_TTL_SECONDS,
				debugCode: process.env.NODE_ENV === 'production' ? undefined : code,
			}
		} catch (error) {
			if (!isDatabaseUnavailable(error)) throw error

			const challengeId = createMemoryChallengeId()
			memoryChallenges.set(challengeId, {
				id: challengeId,
				phoneE164,
				codeHash,
				expiresAt,
				attempts: 0,
				consumedAt: null,
			})
			phoneSendTimestamps.set(phoneE164, now)

			return {
				challengeId,
				expiresInSec: OTP_TTL_SECONDS,
				debugCode: process.env.NODE_ENV === 'production' ? undefined : code,
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
				if (!isDatabaseUnavailable(error)) throw error
				return issueDevPhoneAuthResult(otpRecord.phoneE164)
			}
		}

		const otpRecord = await prisma.otpCode.findUnique({ where: { id: challengeId } })
		validateOtpRecord(otpRecord)

		const isValid = hashOtp(code) === otpRecord.codeHash
		if (!isValid) {
			await prisma.otpCode.update({
				where: { id: otpRecord.id },
				data: { attempts: { increment: 1 } },
			})
			throw new AppError('Invalid OTP code', 400)
		}

		await prisma.otpCode.update({
			where: { id: otpRecord.id },
			data: { consumedAt: new Date() },
		})

		try {
			const user = await authService.upsertPhoneUser({ phoneE164: otpRecord.phoneE164 })
			return await authService.issueTokens({ user, userAgent, ip })
		} catch (error) {
			if (!isDatabaseUnavailable(error)) throw error
			return issueDevPhoneAuthResult(otpRecord.phoneE164)
		}
	},
}
