// 设计系统 token 落地检查（node 直接运行：node test/unit/frontend/styles/design-tokens.mjs）
// Expected 来源：design-system/figma-variables.json —— 2026-10-09 从 Figma（r5afPtZu8fRMRenk8TJVjO）只读导出的本地变量；
// 设计稿宽度 390（用户 2026-10-09 确认），rpx = px × 750 / 390。用户 2026-10-09 裁决：全部使用新 token，旧 token 废弃。
// 说明：前端测试运行器尚未接入（根 vitest 只跑后端），本脚本为先于实现落盘的可执行检查，不宣称完整 TDD。
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwindcss from 'tailwindcss'

const root = process.cwd()
const figma = JSON.parse(readFileSync(resolve(root, 'design-system/figma-variables.json'), 'utf8'))
const ratio = 750 / figma.source.designWidthPx
const rpx = px => `${Number((px * ratio).toFixed(2))}rpx`
const slug = name => name.replaceAll('/', '-')
let failures = 0
const check = (label, fn) => {
  try { fn(); console.log('✓', label) } catch (error) { failures += 1; console.log('✗', label, '\n   ', error.message.split('\n')[0]) }
}

const tokensPath = resolve(root, 'src/styles/tokens.css')
const tokens = existsSync(tokensPath) ? readFileSync(tokensPath, 'utf8') : ''
const declares = (name, value) => new RegExp(`--${name}:\\s*${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*;`, 'u').test(tokens)

check('tokens.css 存在且同时作用于 page 与 :root', () => {
  assert.ok(tokens.length > 0, 'src/styles/tokens.css 不存在')
  assert.match(tokens, /page\s*,\s*:root\s*\{/u)
})
check('36 个基础色按 Figma 原值声明', () => {
  for (const [name, hex] of Object.entries(figma.primitives)) assert.ok(declares(`prim-${slug(name)}`, hex), `--prim-${slug(name)} 应为 ${hex}`)
})
check('42 个语义色引用对应基础色变量', () => {
  for (const [name, prim] of Object.entries(figma.color)) assert.ok(declares(`color-${slug(name)}`, `var(--prim-${slug(prim)})`), `--color-${slug(name)} 应引用 --prim-${slug(prim)}`)
})
check('间距、圆角按 390 宽换算为 rpx', () => {
  for (const [k, px] of Object.entries(figma.spacing)) assert.ok(declares(`spacing-${k}`, px === 0 ? '0' : rpx(px)), `--spacing-${k} 应为 ${rpx(px)}`)
  for (const [k, px] of Object.entries(figma.radius)) assert.ok(declares(`radius-${k}`, rpx(px)), `--radius-${k} 应为 ${rpx(px)}`)
})
check('字阶（字号/行高）换算为 rpx，字重与字族原值', () => {
  for (const [k, [size, lh]] of Object.entries(figma.typography.scale)) {
    assert.ok(declares(`font-size-${k}`, rpx(size)), `--font-size-${k}`)
    assert.ok(declares(`font-line-height-${k}`, rpx(lh)), `--font-line-height-${k}`)
  }
  for (const [k, w] of Object.entries(figma.typography.weight)) assert.ok(declares(`font-weight-${k}`, String(w)), `--font-weight-${k}`)
  assert.match(tokens, /--font-family-base:\s*'Noto Sans SC'/u)
})
// 2026-10-10 调性规范（Figma 1031:5942）：≥22 号标题字距收紧，display −2%、h1 −1.5%、h2 −1%，以 em 表达
check('标题字距按 Figma 文字样式声明为 em', () => {
  assert.deepEqual(figma.typography.letterSpacing, { display: -0.02, h1: -0.015, h2: -0.01 })
  for (const [k, em] of Object.entries(figma.typography.letterSpacing)) assert.ok(declares(`font-letter-spacing-${k}`, `${em}em`), `--font-letter-spacing-${k}`)
})
check('调性规范：状态与养护色饱和度 ≤55%（Figma 2026-10-10 降饱和）', () => {
  const expected = { 'blue/500': '#4a88bf', 'blue/700': '#2e6491', 'sun/500': '#c99b4a', 'sun/700': '#8f6a2a', 'orange/500': '#c98252', 'orange/700': '#92573a', 'red/500': '#c55a5a', 'red/700': '#9a4141' }
  for (const [name, hex] of Object.entries(expected)) assert.equal(figma.primitives[name].toLowerCase(), hex, name)
})
check('阴影层级 e0–e3 由 y/blur 与阴影色组成', () => {
  for (const [k, e] of Object.entries(figma.elevation)) {
    const y = e.y === 0 ? '0' : rpx(e.y); const blur = e.blur === 0 ? '0' : rpx(e.blur)
    assert.ok(declares(`elevation-${k}`, `0 ${y} ${blur} var(--color-${slug(e.color)})`), `--elevation-${k}`)
  }
})

// 用真实 Tailwind 编译检查类名 → 变量映射，以及旧 token 已废弃
const { default: loadConfig } = await import('tailwindcss/loadConfig.js')
const config = loadConfig(resolve(root, 'tailwind.config.js'))
const probe = [
  'bg-page bg-surface bg-surface-muted bg-brand-subtle bg-overlay bg-inverse bg-brand-primary',
  'text-primary text-secondary text-tertiary text-disabled text-on-brand text-brand text-care-water text-status-danger-text',
  'border border-subtle border-brand-primary',
  'p-md gap-lg px-gutter mt-2xs',
  'rounded-lg rounded-full text-title text-body text-h1 font-medium shadow-e1 shadow-e3 font-sans',
  'bg-secondary text-ink-body bg-lightEnv-dialFill shadow-facing-btn border-brand-border bg-red-500 p-4',
].join(' ')
const css = (await postcss([tailwindcss({ ...config, content: [{ raw: `<div class="${probe}"></div>`, extension: 'html' }], corePlugins: { ...config.corePlugins, preflight: false } })])
  .process('@tailwind utilities;', { from: undefined })).css
const rule = cls => { const m = css.match(new RegExp(`\\.${cls.replace(/[/.]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'u')); return m ? m[1].replace(/\s+/gu, ' ').trim() : null }
const expectRule = (cls, fragment) => { const body = rule(cls); assert.ok(body, `未生成 .${cls}`); assert.ok(body.includes(fragment), `.${cls} 应含 ${fragment}，实际：${body}`) }

check('语义类映射到 Figma 语义变量', () => {
  expectRule('bg-page', 'var(--color-bg-page)')
  expectRule('bg-surface', 'var(--color-bg-surface)')
  expectRule('bg-brand-primary', 'var(--color-brand-primary)')
  expectRule('text-primary', 'var(--color-text-primary)')
  expectRule('text-secondary', 'var(--color-text-secondary)')
  expectRule('text-on-brand', 'var(--color-text-on-brand)')
  expectRule('text-care-water', 'var(--color-care-water)')
  expectRule('text-status-danger-text', 'var(--color-status-danger-text)')
  expectRule('border-subtle', 'var(--color-border-subtle)')
})
const baseCss = (await postcss([tailwindcss({ ...config, content: [{ raw: '<div class="border"></div>', extension: 'html' }], corePlugins: { ...config.corePlugins, preflight: false } })])
  .process('@tailwind base;', { from: undefined })).css
check('基础样式：边框默认实线、宽 0、颜色为 border-default', () => {
  assert.match(baseCss, /border-style:\s*solid/u)
  assert.match(baseCss, /border-color:\s*var\(--color-border-default\)/u)
})
check('间距、圆角、字阶、阴影映射到 token 变量', () => {
  expectRule('p-md', 'var(--spacing-md)')
  expectRule('gap-lg', 'var(--spacing-lg)')
  expectRule('px-gutter', 'var(--spacing-page-gutter)')
  expectRule('rounded-lg', 'var(--radius-lg)')
  expectRule('rounded-full', 'var(--radius-full)')
  expectRule('text-title', 'var(--font-size-title)')
  expectRule('text-title', 'var(--font-line-height-title)')
  expectRule('text-h1', 'var(--font-letter-spacing-h1)')
  expectRule('font-medium', 'var(--font-weight-medium)')
  expectRule('shadow-e1', 'var(--elevation-e1)')
  expectRule('font-sans', 'var(--font-family-base)')
})
check('旧 token 已废弃（不再生成）', () => {
  for (const cls of ['bg-secondary', 'text-ink-body', 'bg-lightEnv-dialFill', 'shadow-facing-btn', 'border-brand-border', 'bg-red-500', 'p-4']) {
    assert.equal(rule(cls), null, `.${cls} 不应再生成`)
  }
})
check('入口引入 tokens.css，旧 --primary-color 变量已移除', () => {
  const globalCss = readFileSync(resolve(root, 'src/styles/global.css'), 'utf8')
  assert.match(globalCss, /@import ['"]\.\/tokens\.css['"]/u)
  assert.doesNotMatch(globalCss, /--primary-color|--secondary-color/u)
})

console.log(failures === 0 ? '\n全部通过' : `\n${failures} 项失败`)
process.exit(failures === 0 ? 0 : 1)
