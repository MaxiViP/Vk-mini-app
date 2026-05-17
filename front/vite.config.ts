import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default ({ mode }: { mode: string }) => {
	const env = loadEnv(mode, process.cwd(), '')
	const apiBaseUrl = env.VITE_API_BASE_URL || 'http://127.0.0.1:3000'

	return defineConfig({
		plugins: [vue()],
		build: {
			target: ['es2020', 'chrome87', 'safari14'],
			sourcemap: false,
			cssCodeSplit: true,
			modulePreload: {
				polyfill: true,
			},
			rollupOptions: {
				output: {
					manualChunks(id) {
						if (!id.includes('node_modules')) return
						if (id.includes('node_modules/vue') || id.includes('node_modules/@vue')) return 'vue'
						if (id.includes('node_modules/pinia')) return 'pinia'
						if (id.includes('node_modules/@vkontakte')) return 'vk'
						if (id.includes('node_modules/axios')) return 'axios'
						if (id.includes('node_modules/marked')) return 'markdown'
						if (id.includes('node_modules/highlight.js')) return 'markdown'
					},
				},
			},
		},
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
