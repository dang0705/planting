import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          isCustomElement: tag => ['picker', 'scroll-view', 'switch'].includes(tag)
        }
      }
    })
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    hmr: false
  },
  test: {
    clearMocks: true,
    environment: 'jsdom',
    include: ['test/unit/frontend/**/*.test.js'],
    restoreMocks: true
  }
})
