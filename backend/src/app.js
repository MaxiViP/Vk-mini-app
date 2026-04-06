import express from 'express'
import cors from 'cors'

import env from './config/env.js'
import logger from './config/logger.js'
import authRoutes from './modules/auth/auth.routes.js'
import userRoutes from './modules/users/user.routes.js'
import billingRoutes from './modules/billing/billing.routes.js'
import usageRoutes from './modules/usage/usage.routes.js'
import llmRoutes from './modules/llm/llm.routes.js'
import adminRoutes from './modules/admin/admin.routes.js'
import { idempotencyMiddleware } from './shared/idempotency.js'
import { apiRateLimit } from './shared/rate-limit.js'
import { errorHandler, notFoundHandler } from './shared/errors.js'

const app = express()

app.use(cors())
app.use(express.json({ limit: '1mb' }))
app.use(apiRateLimit)
app.use(idempotencyMiddleware)

app.get('/health', (_req, res) => {
	res.json({ status: 'ok', env: env.nodeEnv })
})

app.use('/api/auth', authRoutes)
app.use('/api/users', userRoutes)
app.use('/api/billing', billingRoutes)
app.use('/api/payments', billingRoutes)
app.use('/api/usage', usageRoutes)
app.use('/api/llm', llmRoutes)
app.use('/api/admin', adminRoutes)

// Backward compatibility for existing frontend endpoints.
app.use('/api', llmRoutes)

app.use(notFoundHandler)
app.use(errorHandler)

logger.info('Application configured')

export default app
