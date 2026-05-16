import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { applyUiTheme, readStoredUiTheme } from './theme'
import './styles/main.css'

applyUiTheme(readStoredUiTheme())
document.documentElement.style.setProperty('--viewport-height', `${window.innerHeight}px`)

const app = createApp(App)

app.use(createPinia())
app.mount('#app')
