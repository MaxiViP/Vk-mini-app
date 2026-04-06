import { Router } from 'express'

import { authService } from './auth.service.js'
import { oauthService } from './oauth.service.js'
import { otpService } from './otp.service.js'
import { requireFields } from '../../shared/validate.js'
import { logBusinessEvent } from '../../shared/observability.js'

const router = Router()

router.post('/oauth/:provider/start', async (req, res, next) => {
	try {
		requireFields(req.body, ['redirectUri'])
		const result = await oauthService.start({
			provider: req.params.provider,
			redirectUri: req.body.redirectUri,
		})
		await logBusinessEvent({
			eventType: 'auth.oauth.start',
			entityType: 'oauth_provider',
			entityId: req.params.provider,
			payload: { redirectUri: req.body.redirectUri },
			ip: req.ip,
			userAgent: req.headers['user-agent'] || null,
		})
		res.json(result)
	} catch (error) {
		await logBusinessEvent({
			eventType: 'auth.oauth.start.failed',
			entityType: 'oauth_provider',
			entityId: req.params.provider,
			payload: { message: error.message },
			ip: req.ip,
			userAgent: req.headers['user-agent'] || null,
		})
		next(error)
	}
})

router.post('/oauth/:provider/finalize', async (req, res, next) => {
	try {
		requireFields(req.body, ['code', 'state'])
		const result = await oauthService.finalize({
			provider: req.params.provider,
			code: req.body.code,
			state: req.body.state,
			codeVerifier: req.body.codeVerifier,
			userAgent: req.headers['user-agent'] || null,
			ip: req.ip,
		})
		await logBusinessEvent({
			eventType: 'auth.login.success',
			actorUserId: result.user.id,
			entityType: 'user',
			entityId: result.user.id,
			payload: { provider: req.params.provider, method: 'oauth' },
			ip: req.ip,
			userAgent: req.headers['user-agent'] || null,
		})
		res.json(result)
	} catch (error) {
		await logBusinessEvent({
			eventType: 'auth.login.failed',
			entityType: 'oauth_provider',
			entityId: req.params.provider,
			payload: { method: 'oauth', message: error.message },
			ip: req.ip,
			userAgent: req.headers['user-agent'] || null,
		})
		next(error)
	}
})

router.post('/phone/request', async (req, res, next) => {
	try {
		requireFields(req.body, ['phone'])
		const result = await otpService.sendOtp(req.body)
		await logBusinessEvent({
			eventType: 'auth.otp.requested',
			entityType: 'phone',
			entityId: req.body.phone,
			payload: { challengeId: result.challengeId },
			ip: req.ip,
			userAgent: req.headers['user-agent'] || null,
		})
		res.status(202).json(result)
	} catch (error) {
		await logBusinessEvent({
			eventType: 'auth.otp.request.failed',
			entityType: 'phone',
			entityId: req.body.phone || 'unknown',
			payload: { message: error.message },
			ip: req.ip,
			userAgent: req.headers['user-agent'] || null,
		})
		next(error)
	}
})

router.post('/phone/verify', async (req, res, next) => {
	try {
		requireFields(req.body, ['challengeId', 'code'])
		const result = await otpService.verifyOtp({
			...req.body,
			userAgent: req.headers['user-agent'] || null,
			ip: req.ip,
		})
		await logBusinessEvent({
			eventType: 'auth.otp.verified',
			actorUserId: result.user.id,
			entityType: 'user',
			entityId: result.user.id,
			payload: { method: 'phone' },
			ip: req.ip,
			userAgent: req.headers['user-agent'] || null,
		})
		res.json(result)
	} catch (error) {
		await logBusinessEvent({
			eventType: 'auth.otp.verify.failed',
			entityType: 'challenge',
			entityId: req.body.challengeId || 'unknown',
			payload: { message: error.message },
			ip: req.ip,
			userAgent: req.headers['user-agent'] || null,
		})
		next(error)
	}
})

router.post('/refresh', async (req, res, next) => {
	try {
		requireFields(req.body, ['refreshToken'])
		const result = await authService.refreshSession({
			refreshToken: req.body.refreshToken,
			userAgent: req.headers['user-agent'] || null,
			ip: req.ip,
		})
		res.json(result)
	} catch (error) {
		next(error)
	}
})

router.post('/logout', async (req, res, next) => {
	try {
		requireFields(req.body, ['refreshToken'])
		const result = await authService.logoutSession({ refreshToken: req.body.refreshToken })
		res.json(result)
	} catch (error) {
		next(error)
	}
})

export default router
