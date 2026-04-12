import { Prisma } from '@prisma/client'

const getModelFields = modelName =>
	new Set((Prisma.dmmf?.datamodel?.models?.find(model => model.name === modelName)?.fields || []).map(field => field.name))

const usageEventFields = getModelFields('UsageEvent')
const planFields = getModelFields('Plan')
const subscriptionFields = getModelFields('Subscription')

export const prismaCompat = {
	hasUsageStatus: usageEventFields.has('status'),
	hasUsageBillingFields:
		usageEventFields.has('billingTier') &&
		usageEventFields.has('billingSource') &&
		usageEventFields.has('status') &&
		usageEventFields.has('subscriptionId'),
	hasPlanBillingFields:
		planFields.has('priceMinor') && planFields.has('intervalDays') && planFields.has('accessTier'),
	hasSubscriptionBillingFields:
		subscriptionFields.has('includedRequests') &&
		subscriptionFields.has('usedRequests') &&
		subscriptionFields.has('endedAt'),
}

const LEGACY_SCHEMA_PATTERNS = [
	'Unknown argument `status`',
	'Unknown argument status',
	'Unknown argument `billingTier`',
	'Unknown argument billingTier',
	'Unknown argument `billingSource`',
	'Unknown argument billingSource',
	'Unknown argument `subscriptionId`',
	'Unknown argument subscriptionId',
	'Unknown argument `priceMinor`',
	'Unknown argument priceMinor',
	'Unknown argument `intervalDays`',
	'Unknown argument intervalDays',
	'Unknown argument `accessTier`',
	'Unknown argument accessTier',
	'Unknown argument `includedRequests`',
	'Unknown argument includedRequests',
	'Unknown argument `usedRequests`',
	'Unknown argument usedRequests',
	'Unknown argument `endedAt`',
	'Unknown argument endedAt',
	'Unknown field',
	'Unknown column',
	'billing_tier',
	'billing_source',
	'subscription_id',
	'price_minor',
	'interval_days',
	'access_tier',
	'included_requests',
	'used_requests',
	'ended_at',
]

export const isLegacyBillingSchemaError = error => {
	const message = String(error?.message || '')
	return LEGACY_SCHEMA_PATTERNS.some(pattern => message.includes(pattern))
}
