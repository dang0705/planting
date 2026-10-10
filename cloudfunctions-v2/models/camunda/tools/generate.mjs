#!/usr/bin/env node
/**
 * Camunda 模型生成入口：由 *-specs.mjs（语义）+ 网格坐标与正交布线生成 5 个 BPMN/DMN 文件。
 * 用法：
 *   node generate.mjs                 写回上级目录（cloudfunctions-v2/models/camunda/）
 *   node generate.mjs --out <目录>     写到指定目录（用于与现有文件逐字节比对）
 *   node generate.mjs --preview <目录> 另外输出 SVG 预览（仅本地查看，不入库）
 * 只用 Node 内置模块；不访问网络或数据库。
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildBpmn } from './bpmn-build.mjs'
import { buildDmn } from './dmn-build.mjs'
import { guestClaim, longTermCare, wateringAdvice } from './bpmn-specs.mjs'
import { longTermRules, mvpWatering } from './dmn-specs.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const arg = name => { const i = process.argv.indexOf(name); return i === -1 ? null : resolve(process.argv[i + 1]) }
const outDir = arg('--out') ?? resolve(here, '..')
const previewDir = arg('--preview')
mkdirSync(outDir, { recursive: true })
if (previewDir) mkdirSync(previewDir, { recursive: true })

const targets = [
  ['mvp-watering-decisions.dmn', () => buildDmn(mvpWatering)],
  ['long-term-care-rules.dmn', () => buildDmn(longTermRules)],
  ['watering-advice-request.bpmn', () => buildBpmn(wateringAdvice)],
  ['long-term-care-loop.bpmn', () => buildBpmn(longTermCare)],
  ['guest-claim.bpmn', () => buildBpmn(guestClaim)],
]
let failed = false
for (const [file, build] of targets) {
  const result = build()
  if (result.missing.length) { failed = true; console.error(`FAIL ${file}: 无法布线 ${result.missing.join(', ')}`); continue }
  writeFileSync(join(outDir, file), result.render())
  if (previewDir) writeFileSync(join(previewDir, file.replace(/\.(bpmn|dmn)$/u, '.svg')), result.svg())
  console.log(`写出 ${join(outDir, file)}`)
}
process.exit(failed ? 1 : 0)
