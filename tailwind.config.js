/** @type {import('tailwindcss').Config} */
import plugin from 'tailwindcss/plugin'

export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: 'var(--primary-color)',
        secondary: 'var(--secondary-color)'
      }
    }
  },
  plugins: [
    plugin(({ addComponents }) => {
      // https://v3.tailwindcss.com/docs/plugins
      addComponents({
        '.position-center': {
          '@apply left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2': {}
        }
      })
    })
  ],
  // Uniapp 特殊配置
  corePlugins: {
    preflight: false // 禁用 Tailwind 的基础样式重置，避免与 Uniapp 冲突
  }
}
