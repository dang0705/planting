// 降级 ES2020 语法（?? 与 ?.）以适配微信小程序运行时。
// 背景：@dcloudio/vite-plugin-uni 将 .js 排除出 esbuild 转译，
// 依赖微信开发者工具 Babel 处理 vendor.js；其默认配置不含
// nullish-coalescing / optional-chaining 插件，导致
// @tanstack/query-core 等 ESM 依赖中的 ?? 原样进入产物而无法解析。
module.exports = {
  presets: [
    [
      '@babel/preset-env',
      {
        // 仅转译语法，不注入 polyfill；微信小程序自带现代 API 运行时。
        modules: false,
        useBuiltIns: 'entry',
        corejs: false
      }
    ]
  ]
}
