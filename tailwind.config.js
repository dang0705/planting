/** @type {import('tailwindcss').Config} */
import plugin from 'tailwindcss/plugin'

export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: 'var(--primary-color)',
        secondary: 'var(--secondary-color)',
        // 品牌绿色阶：主绿 / 深绿 / 极深绿 / 浅绿底 / 边框绿，对应 Figma 设计系统
        brand: {
          DEFAULT: '#00a63e',
          dark: '#008236',
          darker: '#016630',
          tint: '#f0fdf4',
          border: '#b9f8cf'
        }
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
