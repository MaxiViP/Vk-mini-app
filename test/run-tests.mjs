import { cases as aiRouteCases } from '../back/test/ai-routes.test.js'
import { cases as aiChatAccessCases } from '../back/test/ai-chat-access.test.js'
import { cases as aiPromptAssemblyCases } from '../back/test/ai-prompt-assembly.test.js'
import { cases as billingFallbackCases } from '../back/test/billing-fallback.test.js'
import { cases as discountEngineCases } from '../back/test/discount-engine.test.js'
import { cases as smokeRouteCases } from '../back/test/smoke-routes.test.js'
import { cases as frontArchitectureCases } from '../front/test/ai-architecture.test.js'

const allCases = [
	...aiRouteCases,
	...aiChatAccessCases,
	...aiPromptAssemblyCases,
	...billingFallbackCases,
	...discountEngineCases,
	...smokeRouteCases,
	...frontArchitectureCases,
]

let passed = 0

for (const testCase of allCases) {
	try {
		await testCase.run()
		passed += 1
		console.log(`PASS ${testCase.name}`)
	} catch (error) {
		console.error(`FAIL ${testCase.name}`)
		console.error(error)
		process.exit(1)
	}
}

console.log(`\n${passed}/${allCases.length} tests passed`)
