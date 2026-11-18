import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { initSettings } from './stores/settings'
import './styles/themes.css'
import './styles/base.css'
import './styles/markdown.css'

initSettings()

createApp(App).use(router).mount('#app')
