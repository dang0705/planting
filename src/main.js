import { createSSRApp } from 'vue'
import App from './App.vue'
import pinia from './store/index.js'
import './styles/global.css'
import { createPersistedState } from 'pinia-plugin-persistedstate'

export function createApp() {
  const app = createSSRApp(App)
  pinia.use(
    createPersistedState({
      storage: {
        getItem: key => uni.getStorageSync(key),
        setItem: (key, value) => uni.setStorageSync(key, value)
      }
    })
  )
  app.use(pinia)
  return {
    app
  }
}
