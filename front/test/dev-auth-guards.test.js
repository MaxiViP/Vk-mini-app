import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const readSource = relativePath =>
	fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8')

export const cases = [
	{
		name: 'user store defines dev refresh token helper',
		run: async () => {
			const storeSource = readSource('front/src/stores/user.ts')
			const sessionSource = readSource('front/src/services/authSession.ts')
			assert.match(storeSource, /export \{ isDevSessionRefreshToken \}/)
			assert.match(
				sessionSource,
				/export const isDevSessionRefreshToken = \(token\?: string \| null\) => Boolean\(token\?\.startsWith\('dev-refresh-'\)\)/,
			)
		},
	},
	{
		name: 'App startup skips refreshAuth for dev refresh tokens',
		run: async () => {
			const source = readSource('front/src/App.vue')
			assert.match(source, /userStore\.refreshToken && !isDevSessionRefreshToken\(userStore\.refreshToken\)/)
		},
	},
	{
		name: 'chat store skips refresh retry for dev sessions',
		run: async () => {
			const source = readSource('front/src/stores/chat.ts')
			assert.match(
				source,
				/response\.status === 401 && userStore\.refreshToken && !isDevSessionRefreshToken\(userStore\.refreshToken\)/,
			)
		},
	},
	{
		name: 'logout for dev session does not call auth API',
		run: async () => {
			const source = readSource('front/src/stores/user.ts')
			assert.match(source, /refreshToken\.value && !isDevSessionRefreshToken\(refreshToken\.value\)/)
			assert.match(source, /if \(isDevSessionRefreshToken\(refreshToken\.value\)\) return null/)
		},
	},
	{
		name: 'auth session helper retries protected fetch requests through refresh flow',
		run: async () => {
			const source = readSource('front/src/services/authSession.ts')
			assert.match(source, /authorizedFetch/)
			assert.match(source, /response\.status !== 401 \|\| !retryOn401/)
			assert.match(source, /refreshAccessToken\(\)/)
		},
	},
	{
		name: 'auth session helper retries protected axios requests through refresh flow',
		run: async () => {
			const source = readSource('front/src/services/authSession.ts')
			assert.match(source, /authorizedAxiosRequest/)
			assert.match(source, /status !== 401 \|\| !retryOn401/)
			assert.match(source, /Authorization: `Bearer \$\{nextAccessToken\}`/)
		},
	},
]
