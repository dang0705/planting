import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, test } from 'vitest'

import { resolveProfileProgressPolicy, type ProfileProgressPolicy } from '../../src/configuration/profile-progress-policy.js'
import type { UserPlantProfileDto } from '../../src/contracts/types.js'
import { deriveProfileReadiness, evaluateProfileProgress } from '../../src/user-plant/domain/profile-progress.js'
import { findProjectRoot } from '../support/project-root.js'

/**
 * Expected 来源：docs/backend-v2/contracts/user-plant-profile-completeness.md §1～§4、§6（2026-10-10 用户审定：草案按推荐采纳且必须可配置；
 * 追加植物位置 Lux 计分，有效期复用浇水策略 luxAnchorMaxAgeDays）；配置目录 user-plant.profile_progress.policy（confirmed）。
 * 测试层次：L1 / unit_real_data（读取仓库内 v1 发布正文与配置目录）+ unit_fake（构造的档案事实）。不覆盖：数据库发布读取（见 MySQL 用例）。
 */
const root = findProjectRoot()
const release = JSON.parse(fs.readFileSync(path.join(root, 'cloudfunctions-v2/models/user-plant/profile-progress-policy.v1.json'), 'utf8')) as Record<string, unknown>
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'docs/backend-v2/architecture/configuration-variable-catalog.json'), 'utf8')) as { variables: Array<{ id: string; status: string; currentValue: any }> }
const catalogEntry = catalog.variables.find(variable => variable.id === 'user-plant.profile_progress.policy')!
const nowMs = Date.UTC(2026, 9, 10, 12)
const day = 86_400_000
const maxAgeDays = 30
const policy = resolveProfileProgressPolicy(release) as ProfileProgressPolicy

const fullProfile: UserPlantProfileDto = {
  nickname: '小绿',
  measuredPot: { actualInnerPotConfirmed: true, drainageAvailable: true, potTopDiameterCm: 12, potBottomDiameterCm: null, potHeightCm: null },
  substrate: { materials: ['general'], primaryMaterial: null },
  location: { cityRef: 'chongqing', placement: 'indoor' },
  lighting: { windowFacing: 'S' },
  ventilation: { airExchange: 'occasional', localAirflow: 'none', directBlowing: null },
  plantLight: { lux: 1800, measuredAt: new Date(nowMs - day).toISOString(), source: 'meter' }
}
const evaluate = (profile: UserPlantProfileDto | undefined, catalogBound: boolean) =>
  evaluateProfileProgress({ policy, plantLightMaxAgeDays: maxAgeDays, nowMs, facts: { catalogBound, profile } })

describe('计分规则正文（类型化发布）', () => {
  test('v1 正文通过校验；权重与档位与配置目录 confirmed 值一致', () => {
    expect(policy).not.toBeNull()
    expect(catalogEntry.status).toBe('confirmed')
    expect(Object.fromEntries(policy.items.map(item => [item.code, item.weight]))).toEqual(catalogEntry.currentValue.weights)
    expect(Object.fromEntries(policy.levels.map(level => [level.level, level.minPercent]))).toEqual(catalogEntry.currentValue.levels)
    expect(policy.items.reduce((sum, item) => sum + item.weight, 0)).toBe(100)
  })

  test.each([
    ['权重合计不是 100', { ...release, items: (release.items as any[]).map((item, index) => index === 0 ? { ...item, weight: 29 } : item) }],
    ['计分项重复', { ...release, items: (release.items as any[]).map((item, index) => index === 1 ? { ...item, code: 'catalog_binding' } : item) }],
    ['档位不递增', { ...release, levels: [{ level: 'starter', minPercent: 0 }, { level: 'good', minPercent: 80 }, { level: 'great', minPercent: 50 }, { level: 'complete', minPercent: 100 }] }],
    ['首档不是 0', { ...release, levels: [{ level: 'starter', minPercent: 10 }, { level: 'good', minPercent: 50 }, { level: 'great', minPercent: 80 }, { level: 'complete', minPercent: 100 }] }],
    ['末档不是 100', { ...release, levels: [{ level: 'starter', minPercent: 0 }, { level: 'good', minPercent: 50 }, { level: 'great', minPercent: 80 }, { level: 'complete', minPercent: 99 }] }],
    ['合同版本不符', { ...release, contractVersion: 'user-plant-profile-progress/v2' }],
    ['夹带未知字段', { ...release, plantLightMaxAgeDays: 30 }],
    ['不是对象', null]
  ])('%s → 不可用（null）', (_name, document) => {
    expect(resolveProfileProgressPolicy(document)).toBeNull()
  })

  test('解析结果冻结，不能被调用方改写', () => {
    expect(Object.isFrozen(policy)).toBe(true)
    expect(Object.isFrozen(policy.items[0])).toBe(true)
  })
})

describe('完整度计算', () => {
  test('什么都没填：0 分 starter；缺失项按权重降序；下一步推荐品种绑定', () => {
    const result = evaluate(undefined, false)
    expect(result).toMatchObject({ percent: 0, level: 'starter', doneItems: [], nextRecommended: 'catalog_binding' })
    expect(result.missingItems.map(item => [item.code, item.weight, item.editTarget])).toEqual([
      ['catalog_binding', 30, 'catalogBinding'], ['measured_pot', 25, 'measuredPot'], ['substrate', 15, 'substrate'], ['location', 12, 'location'],
      ['plant_light', 10, 'plantLight'], ['ventilation', 5, 'ventilation'], ['lighting', 3, 'lighting']
    ])
    for (const item of result.missingItems) { expect(item.reason.length).toBeGreaterThan(0); expect(item.benefit.length).toBeGreaterThan(0) }
  })

  test('全部完成且 Lux 在有效期内：100 complete，无缺失、下一步为 null', () => {
    expect(evaluate(fullProfile, true)).toEqual({ percent: 100, level: 'complete',
      doneItems: ['catalog_binding', 'measured_pot', 'substrate', 'location', 'plant_light', 'ventilation', 'lighting'], missingItems: [], nextRecommended: null })
  })

  test('Lux 恰好 30 天仍有效；超过 1 毫秒即过期少 10 分；测量时间晚于现在不算', () => {
    const at = (ms: number) => ({ ...fullProfile, plantLight: { ...fullProfile.plantLight!, measuredAt: new Date(ms).toISOString() } })
    expect(evaluate(at(nowMs - maxAgeDays * day), true).percent).toBe(100)
    const stale = evaluate(at(nowMs - maxAgeDays * day - 1), true)
    expect(stale).toMatchObject({ percent: 90, level: 'great', nextRecommended: 'plant_light' })
    expect(evaluate(at(nowMs + 1), true).doneItems).not.toContain('plant_light')
  })

  test('盆器没有排水状态或没有任何尺寸 → 盆项未完成', () => {
    const noDrainage = { ...fullProfile, measuredPot: { ...fullProfile.measuredPot!, drainageAvailable: null } }
    const noSize = { ...fullProfile, measuredPot: { ...fullProfile.measuredPot!, potTopDiameterCm: null } }
    expect(evaluate(noDrainage, true)).toMatchObject({ percent: 75, nextRecommended: 'measured_pot' })
    expect(evaluate(noSize, true).doneItems).not.toContain('measured_pot')
  })

  test('档位边界：50 → good、80 → great（品种 30 + 盆 25 + 盆土 15 + 通风 5 + 朝向 3 = 78 → good）', () => {
    const { plantLight: _light, location: _location, ...partial } = fullProfile
    expect(evaluate(partial, true)).toMatchObject({ percent: 78, level: 'good', nextRecommended: 'location' })
    const { substrate: _substrate, ventilation: _ventilation, lighting: _lighting, ...fifty } = partial
    expect(evaluate({ ...fifty, location: fullProfile.location! }, false)).toMatchObject({ percent: 37, level: 'starter' })
    expect(evaluate({ ...partial, location: fullProfile.location! }, true)).toMatchObject({ percent: 90, level: 'great' })
    expect(evaluate({ nickname: '', measuredPot: fullProfile.measuredPot!, location: fullProfile.location!, lighting: fullProfile.lighting! }, true)).toMatchObject({ percent: 70, level: 'good' })
  })

  test('响应不含规则版本或有效期天数', () => {
    expect(JSON.stringify(evaluate(fullProfile, true))).not.toMatch(/user-plant-profile-progress|maxAge|30/u)
  })
})

describe('养护摘要 profileReadiness 与完整度同一判定', () => {
  test('hasMeasuredPot 要求至少一项尺寸 + 排水非空；hasCatalogBinding 跟随品种绑定', () => {
    expect(deriveProfileReadiness({ catalogBound: true, measuredPot: fullProfile.measuredPot })).toEqual({ hasMeasuredPot: true, hasCatalogBinding: true })
    expect(deriveProfileReadiness({ catalogBound: false, measuredPot: { ...fullProfile.measuredPot!, drainageAvailable: null } })).toEqual({ hasMeasuredPot: false, hasCatalogBinding: false })
    expect(deriveProfileReadiness({ catalogBound: false, measuredPot: undefined })).toEqual({ hasMeasuredPot: false, hasCatalogBinding: false })
  })
})
