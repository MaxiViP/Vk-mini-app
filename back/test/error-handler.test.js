import assert from 'node:assert/strict'

import logger from '../src/config/logger.js'
import { AppError, errorHandler } from '../src/shared/errors.js'
import { patchMethod, restoreAll } from './helpers/patch.js'

const createMockResponse = () => {
	const response = {
		statusCode: null,
		payload: null,
		status(code) {
			this.statusCode = code
			return this
		},
		json(payload) {
			this.payload = payload
			return this
		},
	}

	return response
}

export const cases = [
	{
		name: 'error handler logs 4xx as warn and preserves JSON contract',
		run: async () => {
			const calls = { warn: [], error: [] }
			const restores = [
				patchMethod(logger, 'warn', (message, meta) => {
					calls.warn.push({ message, meta })
				}),
				patchMethod(logger, 'error', (message, meta) => {
					calls.error.push({ message, meta })
				}),
			]

			const req = { method: 'GET', originalUrl: '/api/test/4xx' }
			const res = createMockResponse()

			try {
				errorHandler(new AppError('Bad request', 400, { code: 'BAD_REQUEST' }), req, res, () => {})

				assert.equal(res.statusCode, 400)
				assert.deepEqual(res.payload, {
					message: 'Bad request',
					details: { code: 'BAD_REQUEST' },
				})
				assert.equal(calls.warn.length, 1)
				assert.equal(calls.error.length, 0)
				assert.equal(calls.warn[0].message, 'Request failed')
				assert.equal(calls.warn[0].meta.method, 'GET')
				assert.equal(calls.warn[0].meta.url, '/api/test/4xx')
				assert.equal(calls.warn[0].meta.statusCode, 400)
				assert.equal(calls.warn[0].meta.message, 'Bad request')
				assert.deepEqual(calls.warn[0].meta.details, { code: 'BAD_REQUEST' })
				assert.equal(typeof calls.warn[0].meta.stack, 'string')
			} finally {
				restoreAll(restores)
			}
		},
	},
	{
		name: 'error handler logs 5xx as error and preserves JSON contract',
		run: async () => {
			const calls = { warn: [], error: [] }
			const restores = [
				patchMethod(logger, 'warn', (message, meta) => {
					calls.warn.push({ message, meta })
				}),
				patchMethod(logger, 'error', (message, meta) => {
					calls.error.push({ message, meta })
				}),
			]

			const req = { method: 'POST', originalUrl: '/api/test/5xx' }
			const res = createMockResponse()

			try {
				errorHandler(new Error('Boom'), req, res, () => {})

				assert.equal(res.statusCode, 500)
				assert.deepEqual(res.payload, {
					message: 'Boom',
					details: null,
				})
				assert.equal(calls.warn.length, 0)
				assert.equal(calls.error.length, 1)
				assert.equal(calls.error[0].message, 'Request failed')
				assert.equal(calls.error[0].meta.method, 'POST')
				assert.equal(calls.error[0].meta.url, '/api/test/5xx')
				assert.equal(calls.error[0].meta.statusCode, 500)
				assert.equal(calls.error[0].meta.message, 'Boom')
				assert.equal(calls.error[0].meta.details, null)
				assert.equal(typeof calls.error[0].meta.stack, 'string')
			} finally {
				restoreAll(restores)
			}
		},
	},
]
