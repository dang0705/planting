import './polyfills/abort-controller.js'
import { createSSRApp } from 'vue'
import { VueQueryPlugin } from '@tanstack/vue-query'
import App from './App.vue'
import pinia from './store/index.js'
import './styles/global.css'
import { createPersistedState } from 'pinia-plugin-persistedstate'
import { queryClient } from './lib/query-client.js'

export function createApp() {
  const app = createSSRApp(App)
  pinia.use(
    createPersistedState({
      auto: false,
      storage: {
        getItem: key => uni.getStorageSync(key),
        setItem: (key, value) => {
          if (key === 'plants' || key === 'pinia-plants' || key === 'plant-catalog') {
            console.warn('[PersistBlock] skip local storage write for key:', key)
            return
          }
          uni.setStorageSync(key, value)
        }
      }
    })
  )
  app.use(pinia)
  app.use(VueQueryPlugin, { queryClient })
  return {
    app
  }
}
