import http from 'node:http'

import jwt from 'jsonwebtoken'

import app from '../../src/app.js'
import env from '../../src/config/env.js'

export const startTestServer = async () =>
	new Promise(resolve => {
		const server = http.createServer(app)
		server.listen(0, '127.0.0.1', () => {
			const address = server.address()
			resolve({
				server,
				baseUrl: `http://127.0.0.1:${address.port}`,
			})
		})
	})

export const stopTestServer = async server =>
	new Promise((resolve, reject) => {
		server.close(error => {
			if (error) reject(error)
			else resolve()
		})
	})

export const createAccessToken = (payload = {}) => {
	const { sub, ...rest } = payload

	return jwt.sign(
		{
			status: 'active',
			firstName: 'Test',
			lastName: 'User',
			...rest,
		},
		env.jwtSecret,
		{
			subject: sub || 'test-user',
			expiresIn: '1h',
		},
	)
}
