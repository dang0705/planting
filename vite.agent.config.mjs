import { defineConfig } from 'vite'
import uniModule from '@dcloudio/vite-plugin-uni'
import tailwindcss from 'tailwindcss'
import { fileURLToPath } from 'node:url'
const uni = uniModule.default || uniModule
export default defineConfig({
  root: fileURLToPath(new URL('./src/agent-h5', import.meta.url)),
  base: './',
  plugins: [uni()],
  css: {
    postcss: {
      plugins: [
        tailwindcss({ content: ['./src/agent-h5/**/*.vue'], corePlugins: { preflight: false } })
      ]
    }
  }
})
