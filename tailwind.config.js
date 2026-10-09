/** @type {import('tailwindcss').Config} */
import plugin from 'tailwindcss/plugin'

/**
 * 青花植前端 Tailwind 配置：只使用设计系统 token（用户 2026-10-09 裁决：全部落新 token，旧 token 废弃）。
 * 真相源：Figma 变量 → design-system/figma-variables.json → src/styles/tokens.css（生成）。
 * 这里只把类名映射到 CSS 变量，不写任何具体色值或尺寸；修改设计请改 Figma 变量并重新生成 tokens.css。
 * 设计稿宽 390，尺寸变量均为 rpx（1 设计 px ≈ 1.923rpx）。
 */
const v = name => `var(--${name})`

/** 所有颜色类（bg/text/border/ring/fill…）共享的语义色。 */
const sharedColors = {
  transparent: 'transparent',
  current: 'currentColor',
  inherit: 'inherit',
  white: v('prim-white'),
  brand: {
    primary: v('color-brand-primary'),
    'primary-pressed': v('color-brand-primary-pressed'),
    'primary-disabled': v('color-brand-primary-disabled'),
    'on-primary': v('color-brand-on-primary')
  },
  status: {
    success: v('color-status-success'),
    'success-subtle': v('color-status-success-subtle'),
    warning: v('color-status-warning'),
    'warning-subtle': v('color-status-warning-subtle'),
    'warning-text': v('color-status-warning-text'),
    danger: v('color-status-danger'),
    'danger-subtle': v('color-status-danger-subtle'),
    'danger-text': v('color-status-danger-text'),
    info: v('color-status-info'),
    'info-subtle': v('color-status-info-subtle')
  },
  care: {
    water: v('color-care-water'),
    'water-subtle': v('color-care-water-subtle'),
    'water-text': v('color-care-water-text'),
    light: v('color-care-light'),
    'light-subtle': v('color-care-light-subtle'),
    'light-text': v('color-care-light-text'),
    fertilize: v('color-care-fertilize'),
    'fertilize-subtle': v('color-care-fertilize-subtle')
  }
}

/** 字阶：[字号, 行高] 均取自 token。 */
const typeScale = ['display', 'h1', 'h2', 'h3', 'title', 'body', 'caption', 'micro']

export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    colors: sharedColors,
    // 背景：bg-page / bg-surface / bg-surface-muted / bg-brand-subtle / bg-icon-chip / bg-overlay / bg-inverse，另含共享语义色
    backgroundColor: {
      ...sharedColors,
      page: v('color-bg-page'),
      surface: v('color-bg-surface'),
      'surface-muted': v('color-bg-surface-muted'),
      'brand-subtle': v('color-bg-brand-subtle'),
      'icon-chip': v('color-bg-icon-chip'),
      overlay: v('color-bg-overlay'),
      inverse: v('color-bg-inverse')
    },
    // 文字：text-primary / secondary / tertiary / disabled / on-brand / brand，另含共享语义色
    textColor: {
      ...sharedColors,
      primary: v('color-text-primary'),
      secondary: v('color-text-secondary'),
      tertiary: v('color-text-tertiary'),
      disabled: v('color-text-disabled'),
      'on-brand': v('color-text-on-brand'),
      brand: v('color-text-brand')
    },
    // 边框：border（默认）/ border-subtle / border-default / border-brand-subtle，另含共享语义色
    borderColor: {
      ...sharedColors,
      DEFAULT: v('color-border-default'),
      subtle: v('color-border-subtle'),
      default: v('color-border-default'),
      'brand-subtle': v('color-border-brand-subtle')
    },
    // 间距：p-md / gap-lg / px-gutter（页面左右边距）…
    spacing: {
      0: v('spacing-0'),
      '2xs': v('spacing-2xs'),
      xs: v('spacing-xs'),
      sm: v('spacing-sm'),
      md: v('spacing-md'),
      lg: v('spacing-lg'),
      xl: v('spacing-xl'),
      '2xl': v('spacing-2xl'),
      '3xl': v('spacing-3xl'),
      '4xl': v('spacing-4xl'),
      gutter: v('spacing-page-gutter')
    },
    borderRadius: {
      none: '0',
      xs: v('radius-xs'),
      sm: v('radius-sm'),
      DEFAULT: v('radius-md'),
      md: v('radius-md'),
      lg: v('radius-lg'),
      xl: v('radius-xl'),
      '2xl': v('radius-2xl'),
      full: v('radius-full')
    },
    fontFamily: {
      sans: v('font-family-base')
    },
    fontSize: Object.fromEntries(
      typeScale.map(key => [key, [v(`font-size-${key}`), { lineHeight: v(`font-line-height-${key}`) }]])
    ),
    fontWeight: {
      regular: v('font-weight-regular'),
      medium: v('font-weight-medium'),
      bold: v('font-weight-bold')
    },
    // 阴影：e0 分割线 / e1 卡片 / e2 浮层 / e3 底部弹层
    boxShadow: {
      none: 'none',
      e0: v('elevation-e0'),
      e1: v('elevation-e1'),
      e2: v('elevation-e2'),
      e3: v('elevation-e3')
    }
  },
  plugins: [
    plugin(({ addBase, addComponents }) => {
      // uniapp 关闭了 preflight，这里只补边框默认值：让单写 `border` 即得 1px 实线 + 设计系统默认边框色。
      // `*` 选择器由 weapp-tailwindcss 在小程序端转换为平台支持的选择器。
      addBase({
        '*, ::before, ::after': {
          'border-width': '0',
          'border-style': 'solid',
          'border-color': v('color-border-default')
        }
      })
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
