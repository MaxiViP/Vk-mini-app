import crypto from 'node:crypto'

import prisma from '../../db/prisma.js'
import { AppError } from '../../shared/errors.js'
import { authService } from './auth.service.js'

const OTP_TTL_SECONDS = 5 * 60
const OTP_MAX_ATTEMPTS = 5
const OTP_RESEND_COOLDOWN_SEC = 30

const phoneSendTimestamps = new Map()

const normalizePhone = rawPhone => rawPhone.replace(/\s+/g, '').trim()
const hashOtp = otp => crypto.createHash('sha256').update(otp).digest('hex')
const generateOtp = () => `${Math.floor(100000 + Math.random() * 900000)}`

// export const otpService = {
// 	async sendOtp({ phone }) {
// 		const phoneE164 = normalizePhone(phone || '')
// 		if (!phoneE164) throw new AppError('phone is required', 400)

// 		const now = Date.now()
// 		const lastSent = phoneSendTimestamps.get(phoneE164) || 0
// 		if (now - lastSent < OTP_RESEND_COOLDOWN_SEC * 1000) {
// 			throw new AppError(`OTP resend cooldown ${OTP_RESEND_COOLDOWN_SEC}s`, 429)
// 		}

// 		const code = generateOtp()
// 		const codeHash = hashOtp(code)
// 		const expiresAt = new Date(now + OTP_TTL_SECONDS * 1000)

// 		const challenge = await prisma.otpCode.create({
// 			data: {
// 				phoneE164,
// 				codeHash,
// 				expiresAt,
// 			},
// 		})

// 		phoneSendTimestamps.set(phoneE164, now)

// 		return {
// 			challengeId: challenge.id,
// 			expiresInSec: OTP_TTL_SECONDS,
// 			debugCode: process.env.NODE_ENV === 'production' ? undefined : code,
// 		}
// 	},

// 	async verifyOtp({ challengeId, code, userAgent, ip }) {
// 		if (!challengeId || !code) throw new AppError('challengeId and code are required', 400)

// 		const otpRecord = await prisma.otpCode.findUnique({ where: { id: challengeId } })
// 		if (!otpRecord) throw new AppError('Challenge not found', 404)
// 		if (otpRecord.consumedAt) throw new AppError('Challenge already used', 400)
// 		if (otpRecord.expiresAt < new Date()) throw new AppError('OTP expired', 400)
// 		if (otpRecord.attempts >= OTP_MAX_ATTEMPTS) throw new AppError('OTP attempts exceeded', 429)

// 		const isValid = hashOtp(code) === otpRecord.codeHash
// 		if (!isValid) {
// 			await prisma.otpCode.update({
// 				where: { id: otpRecord.id },
// 				data: { attempts: { increment: 1 } },
// 			})
// 			throw new AppError('Invalid OTP code', 400)
// 		}

// 		await prisma.otpCode.update({
// 			where: { id: otpRecord.id },
// 			data: { consumedAt: new Date() },
// 		})

// 		const user = await authService.upsertPhoneUser({ phoneE164: otpRecord.phoneE164 })
// 		return authService.issueTokens({ user, userAgent, ip })
// 	},
// }

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
        debugCode: process.env.NODE_ENV === 'production' ? undefined : code,   // ключевое поле
    }
},

	async verifyOtp({ challengeId, code, userAgent, ip }) {
		if (!challengeId || !code) throw new AppError('challengeId and code are required', 400)

		const otpRecord = await prisma.otpCode.findUnique({ where: { id: challengeId } })
		if (!otpRecord) throw new AppError('Challenge not found', 404)
		if (otpRecord.consumedAt) throw new AppError('Challenge already used', 400)
		if (otpRecord.expiresAt < new Date()) throw new AppError('OTP expired', 400)
		if (otpRecord.attempts >= OTP_MAX_ATTEMPTS) throw new AppError('OTP attempts exceeded', 429)

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

		const user = await authService.upsertPhoneUser({ phoneE164: otpRecord.phoneE164 })
		return authService.issueTokens({ user, userAgent, ip })
	},
}
