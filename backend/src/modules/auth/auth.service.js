import crypto from 'node:crypto'

import jwt from 'jsonwebtoken'

import env from '../../config/env.js'
import prisma from '../../db/prisma.js'
import { AppError } from '../../shared/errors.js'
import { isAdminUser } from '../../shared/access.js'

const ACCESS_TOKEN_TTL = '15m'
const REFRESH_TOKEN_TTL_DAYS = 30

function hashValue(value) {
	return crypto.createHash('sha256').update(value).digest('hex')
}

const signAccessToken = user =>
	jwt.sign({ sub: user.id, status: user.status }, env.jwtSecret, {
		expiresIn: ACCESS_TOKEN_TTL,
	})

const createRefreshToken = () => crypto.randomBytes(48).toString('hex')

const createSession = async ({ userId, userAgent, ip }) => {
	const refreshToken = createRefreshToken()
	const refreshTokenHash = hashValue(refreshToken)
	const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000)

	const session = await prisma.session.create({
		data: {
			userId,
			refreshTokenHash,
			userAgent,
			ip,
			expiresAt,
		},
	})

	return { session, refreshToken, expiresAt }
}

const ensureWalletExists = async userId => {
	await prisma.wallet.upsert({
		where: { userId },
		update: {},
		create: { userId, balanceMinor: 0, currency: 'RUB' },
	})
}

const normalizePhone = rawPhone => {
	const digits = String(rawPhone || '').replace(/\D/g, '')
	if (!digits) return ''

	let normalizedDigits = digits

	if (normalizedDigits.length === 11 && normalizedDigits.startsWith('8')) {
		normalizedDigits = `7${normalizedDigits.slice(1)}`
	} else if (normalizedDigits.length === 10) {
		normalizedDigits = `7${normalizedDigits}`
	}

	return `+${normalizedDigits}`
}

export const authService = {
	hashValue,

	async issueTokens({ user, userAgent, ip }) {
		if (user.status !== 'active') {
			throw new AppError('User is not active', 403)
		}

		await ensureWalletExists(user.id)
		const accessToken = signAccessToken(user)
		const sessionData = await createSession({ userId: user.id, userAgent, ip })
		const admin = await isAdminUser(user.id)

		return {
			accessToken,
			refreshToken: sessionData.refreshToken,
			refreshTokenExpiresAt: sessionData.expiresAt,
			user: {
				...user,
				isAdmin: admin,
			},
		}
	},

	async refreshSession({ refreshToken, userAgent, ip }) {
		if (!refreshToken) throw new AppError('refreshToken is required', 400)
		const refreshTokenHash = hashValue(refreshToken)

		const existingSession = await prisma.session.findFirst({
			where: {
				refreshTokenHash,
				revokedAt: null,
				expiresAt: { gt: new Date() },
			},
			include: { user: true },
		})

		if (!existingSession) throw new AppError('Invalid refresh token', 401)

		await prisma.session.update({
			where: { id: existingSession.id },
			data: { revokedAt: new Date() },
		})

		return this.issueTokens({ user: existingSession.user, userAgent, ip })
	},

	async logoutSession({ refreshToken }) {
		if (!refreshToken) throw new AppError('refreshToken is required', 400)

		const refreshTokenHash = hashValue(refreshToken)
		await prisma.session.updateMany({
			where: { refreshTokenHash, revokedAt: null },
			data: { revokedAt: new Date() },
		})

		return { success: true }
	},

	async upsertOAuthUser({ provider, providerUserId, profile = {} }) {
		if (!providerUserId) throw new AppError('providerUserId is required', 400)

		const email = profile.email || null
		const firstName = profile.firstName || profile.first_name || null
		const lastName = profile.lastName || profile.last_name || null
		const avatarUrl = profile.avatarUrl || profile.photo_200 || profile.avatar_url || null

		const existingIdentity = await prisma.authIdentity.findUnique({
			where: {
				provider_providerUserId: {
					provider,
					providerUserId,
				},
			},
			include: { user: true },
		})

		if (existingIdentity?.user) {
			return prisma.user.update({
				where: { id: existingIdentity.user.id },
				data: {
					firstName,
					lastName,
					avatarUrl,
					email: email ?? existingIdentity.user.email,
				},
			})
		}

		if (email) {
			const existingUserByEmail = await prisma.user.findUnique({ where: { email } })
			if (existingUserByEmail) {
				await prisma.authIdentity.upsert({
					where: {
						provider_providerUserId: {
							provider,
							providerUserId,
						},
					},
					update: {
						userId: existingUserByEmail.id,
						providerPayload: profile,
					},
					create: {
						userId: existingUserByEmail.id,
						provider,
						providerUserId,
						providerPayload: profile,
					},
				})

				return prisma.user.update({
					where: { id: existingUserByEmail.id },
					data: {
						firstName: firstName ?? existingUserByEmail.firstName,
						lastName: lastName ?? existingUserByEmail.lastName,
						avatarUrl: avatarUrl ?? existingUserByEmail.avatarUrl,
						email,
					},
				})
			}
		}

		return prisma.user.create({
			data: {
				email,
				firstName,
				lastName,
				avatarUrl,
				status: 'active',
				authIdentities: {
					create: {
						provider,
						providerUserId,
						providerPayload: profile,
					},
				},
			},
		})
	},
	async upsertPhoneUser({ phoneE164 }) {
		const normalizedPhone = normalizePhone(phoneE164)
		if (!normalizedPhone) throw new AppError('phone is required', 400)

		let user = await prisma.user.findUnique({ where: { phoneE164: normalizedPhone } })
		if (!user) {
			user = await prisma.user.create({
				data: {
					phoneE164: normalizedPhone,
					status: 'active',
					firstName: 'User',
					lastName: 'Phone',
				},
			})
		}

		const providerUserId = hashValue(normalizedPhone)
		await prisma.authIdentity.upsert({
			where: {
				provider_providerUserId: {
					provider: 'phone',
					providerUserId,
				},
			},
			update: { userId: user.id },
			create: {
				userId: user.id,
				provider: 'phone',
				providerUserId,
				providerPayload: { phoneE164: normalizedPhone },
			},
		})

		return user
	},
}
