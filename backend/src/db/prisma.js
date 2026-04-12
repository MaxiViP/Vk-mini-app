import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

import logger from '../config/logger.js'

const require = createRequire(import.meta.url)

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const backendRoot = path.resolve(__dirname, '../..')
const prismaCliPath = require.resolve('prisma/build/index.js')

const AUTO_GENERATE = process.env.PRISMA_AUTO_GENERATE !== 'false'
const AUTO_MIGRATE = process.env.PRISMA_AUTO_MIGRATE !== 'false'

const REQUIRED_MODEL_FIELDS = {
	UsageEvent: ['billingTier', 'billingSource', 'status', 'subscriptionId', 'requestId'],
	Plan: ['priceMinor', 'intervalDays', 'accessTier'],
	Subscription: ['includedRequests', 'usedRequests', 'endedAt'],
}

const REQUIRED_DB_COLUMNS = {
	usage_events: ['billing_tier', 'billing_source', 'status', 'subscription_id'],
	plans: ['price_minor', 'interval_days', 'access_tier'],
	subscriptions: ['included_requests', 'used_requests', 'ended_at'],
}

const clearPrismaModuleCache = () => {
	for (const cacheKey of Object.keys(require.cache)) {
		if (
			cacheKey.includes(`${path.sep}@prisma${path.sep}client`) ||
			cacheKey.includes(`${path.sep}.prisma${path.sep}client`)
		) {
			delete require.cache[cacheKey]
		}
	}
}

const loadPrismaModule = () => {
	clearPrismaModuleCache()
	return require('@prisma/client')
}

const getMissingModelFields = Prisma => {
	const models = Prisma?.dmmf?.datamodel?.models || []

	return Object.entries(REQUIRED_MODEL_FIELDS).flatMap(([modelName, requiredFields]) => {
		const fieldNames = new Set((models.find(model => model.name === modelName)?.fields || []).map(field => field.name))

		return requiredFields
			.filter(fieldName => !fieldNames.has(fieldName))
			.map(fieldName => `${modelName}.${fieldName}`)
	})
}

const formatCliError = error => {
	const stdout = error?.stdout ? String(error.stdout).trim() : ''
	const stderr = error?.stderr ? String(error.stderr).trim() : ''
	return [stdout, stderr, error?.message || 'Unknown Prisma CLI error'].filter(Boolean).join(' | ')
}

const runPrismaCli = (args, label) => {
	logger.warn(`Running Prisma ${label}`, { args })
	try {
		execFileSync(process.execPath, [prismaCliPath, ...args], {
			cwd: backendRoot,
			env: process.env,
			stdio: 'pipe',
		})
		logger.info(`Prisma ${label} completed`)
	} catch (error) {
		throw new Error(`Prisma ${label} failed. ${formatCliError(error)}`)
	}
}

const getMissingDbColumns = async prisma =>
	(
		await Promise.all(
			Object.entries(REQUIRED_DB_COLUMNS).map(async ([tableName, requiredColumns]) => {
				const rows = await prisma.$queryRaw`
					SELECT COLUMN_NAME AS columnName
					FROM INFORMATION_SCHEMA.COLUMNS
					WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${tableName}
				`
				const existingColumns = new Set(rows.map(row => row.columnName))

				return requiredColumns
					.filter(columnName => !existingColumns.has(columnName))
					.map(columnName => `${tableName}.${columnName}`)
			}),
		)
	).flat()

const createPrismaClient = PrismaModule => new PrismaModule.PrismaClient()

const initializePrisma = async () => {
	let PrismaModule = loadPrismaModule()
	let missingModelFields = getMissingModelFields(PrismaModule.Prisma)

	if (missingModelFields.length > 0) {
		if (!AUTO_GENERATE) {
			throw new Error(
				`Prisma client is outdated. Missing generated fields: ${missingModelFields.join(', ')}. ` +
					'Enable PRISMA_AUTO_GENERATE or run "prisma generate" during deploy.',
			)
		}

		runPrismaCli(['generate'], 'generate')
		PrismaModule = loadPrismaModule()
		missingModelFields = getMissingModelFields(PrismaModule.Prisma)

		if (missingModelFields.length > 0) {
			throw new Error(
				`Prisma client is still outdated after generate. Missing fields: ${missingModelFields.join(', ')}`,
			)
		}
	}

	let prisma = createPrismaClient(PrismaModule)
	let missingDbColumns = await getMissingDbColumns(prisma)

	if (missingDbColumns.length > 0) {
		if (!AUTO_MIGRATE) {
			await prisma.$disconnect().catch(() => {})
			throw new Error(
				`Database schema is outdated. Missing columns: ${missingDbColumns.join(', ')}. ` +
					'Enable PRISMA_AUTO_MIGRATE or run "prisma migrate deploy" during deploy.',
			)
		}

		await prisma.$disconnect().catch(() => {})
		runPrismaCli(['migrate', 'deploy'], 'migrate deploy')

		prisma = createPrismaClient(PrismaModule)
		missingDbColumns = await getMissingDbColumns(prisma)

		if (missingDbColumns.length > 0) {
			await prisma.$disconnect().catch(() => {})
			throw new Error(
				`Database schema is still outdated after migrate deploy. Missing columns: ${missingDbColumns.join(', ')}`,
			)
		}
	}

	return prisma
}

let prisma
let prismaInitError = null

const prismaReady = initializePrisma()
	.then(client => {
		prisma = client
		return client
	})
	.catch(error => {
		prismaInitError = error
		const reason = error instanceof Error ? error.message : 'Unknown Prisma init error'
		logger.error('Prisma bootstrap failed', { reason })
		prisma = new Proxy(
			{},
			{
				get() {
					throw new Error(`Prisma client is not initialized. ${reason}`)
				},
			},
		)
		throw error
	})

export const ensurePrismaReady = async () => {
	await prismaReady
	if (prismaInitError) throw prismaInitError
	return prisma
}

await prismaReady.catch(() => {})

export default prisma
