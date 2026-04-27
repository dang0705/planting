import './polyfills/abort-controller.js'
import { createSSRApp } from 'vue'
import { VueQueryPlugin } from '@tanstack/vue-query'
import App from './App.vue'
import pinia from './store/index.js'
import './styles/global.css'
import { createPersistedState } from 'pinia-plugin-persistedstate'
import { queryClient } from './lib/query-client.js'
// #ifdef H5
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
// #endif

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
  // #ifdef H5
  app.use(ElementPlus)
  // #endif
  return {
    app
  }
}
