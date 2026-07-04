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
          accent: '#00c950',
          tint: '#f0fdf4',
          border: '#b9f8cf'
        },
        // 光照环境选择器（LightEnvironmentPicker）色系，对齐 Figma 220:62 / 154:271
        lightEnv: {
          dialStroke: '#C7E0D1',
          facingActive: '#276845',
          facingText: '#2e4838',
          dialFill: '#F5FBF7',
          innerAmbient: '#EBF6EF',
          uncertain: '#74907e'
        },
        // 中性文字与边框：标题深 / 次级 / 辅助 / 未选中边框，跨组件复用
        ink: {
          title: '#1e2939',
          body: '#4a5565',
          muted: '#99a1af',
          faint: '#6a7282',
          close: '#9aa4b2',
          inactiveBorder: '#d1d5dc'
        },
        // 状态提示底色
        status: {
          hintBg: '#fffbeb',
          hintText: '#973c00',
          directSunBg: '#f8faf9',
          compassBg: '#f9fafb'
        }
      },
      boxShadow: {
        // 方位按钮与不确定按钮阴影，对齐 Figma 220:62
        'facing-btn': '0 6px 14px rgba(21, 58, 37, 0.12)',
        'uncertain-btn': '0 4px 10px rgba(21, 58, 37, 0.05)'
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
