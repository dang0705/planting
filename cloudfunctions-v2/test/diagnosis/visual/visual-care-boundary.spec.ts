import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

import { evaluateVisualGenOutput } from '../../../src/diagnosis/domain/visual-gen-safety-gate.js'
import { projectVisualGenResult } from '../../../src/diagnosis/domain/project-visual-gen-result.js'
import { findProjectRoot } from '../../support/project-root.js'
import { validModelText } from './support/visual-fakes.js'

/**
 * Expected 来源：ClickUp z8v0kmvhnd「建议加入养护只生成建议，用户确认后才写入 care」、CLAUDE.md §4（诊断只能产生建议；
 * 只有用户确认后的 care 用例才可写成养护事件或提醒）、配置目录硬规则 diagnosis.advice.direct_fact_write = false，
 * diagnosis-visual-api.md §6（临时结果不得写入任何 user_plant 事实）。
 * 测试层次：unit_real_data（扫描真实源码）+ unit_fake（纯投影）。这是边界守护测试：确认动作由 care 现有确认接口承担。
 */
const visualDir = path.join(findProjectRoot(), 'cloudfunctions-v2/src/diagnosis/visual')
function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? sourceFiles(path.join(dir, entry.name)) : entry.name.endsWith('.ts') ? [path.join(dir, entry.name)] : []
  )
}

describe('视觉诊断与养护的边界', () => {
  test('视觉诊断代码不引用 care 域、不写任何 care_ 或 user_plant 事实表', () => {
    for (const file of sourceFiles(visualDir)) {
      const text = fs.readFileSync(file, 'utf8')
      expect(text, file).not.toMatch(/from '\.\.\/(?:\.\.\/)*care\//u)
      expect(text, file).not.toMatch(/(?:INSERT INTO|UPDATE)\s+`?(?:care_|user_plant)/iu)
    }
  })

  test('每条推荐行动都标记必须由用户确认，非 care 能力类型只作展示（none）', () => {
    const gate = evaluateVisualGenOutput(JSON.parse(validModelText), { edibleContext: 'unknown', causeCatalog: ['pest_whitefly'] })
    if (gate.status !== 'pass') {
      throw new Error('fixture')
    }
    const result = projectVisualGenResult(gate.output, { edibleContext: 'unknown' })
    expect(result.recommendedActions.length).toBeGreaterThan(0)
    for (const action of result.recommendedActions) {
      expect(action.requiresUserConfirmation).toBe(true)
      expect(['watering', 'fertilizing', 'lighting', 'ventilation', 'none']).toContain(action.careProposalKind)
    }
  })
})
