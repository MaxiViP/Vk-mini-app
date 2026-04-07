import { defineConfig, loadEnv, UserConfigExport } from 'vite'
import vue from '@vitejs/plugin-vue'

export default ({ mode }: { mode: string }) => {
	const env = loadEnv(mode, process.cwd(), '')
	return defineConfig({
		plugins: [vue()],
		server: {
			port: 5173,
			proxy: {
				'/api': {
					target: env.VITE_API_BASE_URL,
					changeOrigin: true,
				},
			},
		},
	})
}
