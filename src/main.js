import { createSSRApp } from 'vue'
import App from './App.vue'
import pinia from './store/index.js'
import './styles/global.css'
import piniaPluginPersistence from 'pinia-plugin-persistedstate'

export function createApp() {
  const app = createSSRApp(App)
  pinia.use(piniaPluginPersistence)
  app.use(pinia)
  return {
    app
  }
}
