import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default ({ mode }: { mode: string }) => {
	const env = loadEnv(mode, process.cwd(), '')
	const apiBaseUrl = env.VITE_API_BASE_URL || 'http://127.0.0.1:3000'

	return defineConfig({
		plugins: [vue()],
		server: {
			host: '0.0.0.0',
			port: 5173,
			strictPort: true,
			proxy: {
				'/api': {
					target: apiBaseUrl,
					changeOrigin: true,
				},
			},
		},
	})
}
