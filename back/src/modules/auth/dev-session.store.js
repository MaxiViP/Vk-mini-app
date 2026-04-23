import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'

import env from '../../config/env.js'
import { AppError } from '../../shared/errors.js'

const DEV_ACCESS_TOKEN_TTL = env.accessTokenTtl
const DEV_REFRESH_TOKEN_TTL_DAYS = env.refreshTokenTtlDays

const devRefreshSessions = new Map()

const createDevRefreshToken = () => `dev-refresh-${crypto.randomUUID()}`

const buildDevAccessToken = user =>
	jwt.sign(
		{
			sub: user.id,
			status: user.status,
			phoneE164: user.phoneE164,
			firstName: user.firstName,
			lastName: user.lastName,
			avatarUrl: user.avatarUrl,
			isAdmin: user.isAdmin,
		},
		env.jwtSecret,
		{
			expiresIn: DEV_ACCESS_TOKEN_TTL,
		},
	)

const issueDevSession = user => {
	const refreshToken = createDevRefreshToken()
	const expiresAt = new Date(Date.now() + DEV_REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000)

	devRefreshSessions.set(refreshToken, {
		user,
		expiresAt,
	})

	return {
		accessToken: buildDevAccessToken(user),
		refreshToken,
		refreshTokenExpiresAt: expiresAt,
		user,
	}
}

export const isDevRefreshToken = refreshToken => String(refreshToken || '').startsWith('dev-refresh-')

export const issueDevAuthResult = user => issueDevSession(user)

export const refreshDevAuthResult = refreshToken => {
	const session = devRefreshSessions.get(refreshToken)
	if (!session || session.expiresAt <= new Date()) {
		if (session) {
			devRefreshSessions.delete(refreshToken)
		}
		throw new AppError('Invalid refresh token', 401)
	}

	devRefreshSessions.delete(refreshToken)
	return issueDevSession(session.user)
}

export const revokeDevRefreshToken = refreshToken => {
	devRefreshSessions.delete(refreshToken)
	return { success: true }
}
