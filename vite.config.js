import { resolve } from 'node:path'
import uni from '@dcloudio/vite-plugin-uni'

import { defineConfig } from 'vite'
import { UnifiedViteWeappTailwindcssPlugin as uvwt } from 'weapp-tailwindcss/vite'

// https://vitejs.dev/config/
const isH5 = process.env.UNI_PLATFORM === 'h5'
const isApp = process.env.UNI_PLATFORM === 'app'
const WeappTailwindcssDisabled = isH5 || isApp

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    },
    extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.vue']
  },
  css: {
    postcss: {
      plugins: [require('tailwindcss')]
    }
  },
  plugins: [
    uni(),
    uvwt({
      disabled: WeappTailwindcssDisabled
    })
  ],
  optimizeDeps: {
    exclude: ['@dcloudio/uni-h5']
  },
  build: {
    rollupOptions: {
      external: isH5 ? [] : ['@dcloudio/uni-h5']
    }
  }
})
