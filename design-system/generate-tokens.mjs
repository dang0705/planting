#!/usr/bin/env node
// 由 design-system/figma-variables.json（Figma 变量导出，唯一真相源）生成 src/styles/tokens.css。
// 用法：node design-system/generate-tokens.mjs
// 单位：设计稿宽度 designWidthPx（390，用户 2026-10-09 确认），尺寸统一换算为 rpx = px × 750 / 设计宽。
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const source = JSON.parse(readFileSync(resolve(here, 'figma-variables.json'), 'utf8'))
const ratio = 750 / source.source.designWidthPx
/** 设计 px → rpx，保留两位小数；0 保持无单位。 */
const rpx = px => (px === 0 ? '0' : `${Number((px * ratio).toFixed(2))}rpx`)
/** Figma 变量名中的「/」转为 CSS 变量名中的「-」。 */
const slug = name => name.replaceAll('/', '-')

const lines = []
const section = title => lines.push('', `  /* ${title} */`)
section('基础色板（Primitives）：只供语义色引用，页面与组件不要直接使用')
for (const [name, hex] of Object.entries(source.primitives)) lines.push(`  --prim-${slug(name)}: ${hex};`)
section('语义色（Color）：页面与组件只使用这一层')
for (const [name, prim] of Object.entries(source.color)) lines.push(`  --color-${slug(name)}: var(--prim-${slug(prim)});`)
section('间距（Spacing）')
for (const [key, px] of Object.entries(source.spacing)) lines.push(`  --spacing-${key}: ${rpx(px)};`)
section('圆角（Radius）')
for (const [key, px] of Object.entries(source.radius)) lines.push(`  --radius-${key}: ${rpx(px)};`)
section('字体（Typography）')
lines.push(`  --font-family-base: '${source.typography.family}', 'PingFang SC', 'Microsoft YaHei', sans-serif;`)
for (const [key, [size, lineHeight]] of Object.entries(source.typography.scale)) {
  lines.push(`  --font-size-${key}: ${rpx(size)};`, `  --font-line-height-${key}: ${rpx(lineHeight)};`)
}
for (const [key, weight] of Object.entries(source.typography.weight)) lines.push(`  --font-weight-${key}: ${weight};`)
section('阴影层级（Elevation）：e0 分割线、e1 卡片、e2 浮层、e3 底部弹层')
for (const [key, e] of Object.entries(source.elevation)) {
  lines.push(`  --elevation-${key}: 0 ${rpx(e.y)} ${rpx(e.blur)} var(--color-${slug(e.color)});`)
}

const css = `/* 由 design-system/generate-tokens.mjs 生成，请勿手改；修改请在 Figma 调整变量后重新导出并运行生成脚本。
 * 来源：Figma ${source.source.figmaFileKey}（${source.source.exportedAt} 导出），设计宽 ${source.source.designWidthPx}，1 设计 px = ${Number(ratio.toFixed(4))}rpx。
 */
page,
:root {${lines.join('\n')}
}
`
writeFileSync(resolve(here, '../src/styles/tokens.css'), css)
console.log('已生成 src/styles/tokens.css')
