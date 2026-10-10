import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import { describe, expect, test } from 'vitest'

import { findProjectRoot } from '../support/project-root.js'

/**
 * Expected 来源：用户 2026-10-10 裁定（经协调方转达）冻结「诊断上下文内部接口」合同——
 * 事实摘要结构、约 600 tokens 上限、不传坐标与地址；临时案例只给有限事实；
 * 症状出现时间等只在追问中使用、不进入长期上下文。设计依据：
 * docs/backend-v2/architecture/visual-diagnosis-plan-2026-10-10.md §12.5。
 * 测试层次：unit_real_data（编译真实合同文件与路由登记表，不实现接口、不访问数据库）。
 * 未覆盖：接口实现、事实时效计算、长度裁剪、服务签名鉴权。
 */
const root = findProjectRoot()
const schemaPath = path.join(
  root,
  'docs/backend-v2/contracts/schemas/diagnosis-context-summary.v1.schema.json'
)
const routeRegistryPath = path.join(root, 'docs/backend-v2/api/route-registry.json')
const contractRegistryPath = path.join(root, 'docs/backend-v2/contracts/contract-registry.json')

function fact(key: string, valueZh = '已记录', extra: Record<string, unknown> = {}) {
  return {
    key,
    valueZh,
    observedAt: '2026-10-08T02:00:00Z',
    ageDays: 2,
    reliability: 'user_entered',
    freshness: 'fresh',
    ...extra
  }
}

const longTerm = {
  contractVersion: 'diagnosis-context-summary/v1',
  caseKind: 'long_term_plant',
  generatedAt: '2026-10-10T12:00:00Z',
  facts: [
    fact('plant_identity', '绿萝（天南星科麒麟叶属），已确认', { reliability: 'user_confirmed' }),
    fact('pot_and_drainage', '15 厘米塑料盆，有排水孔'),
    fact('watering_history', '近 14 天浇水 4 次，最近一次 2 天前'),
    fact('soil_observation', '最近一次盆土观察：微湿'),
    fact('recent_radiation', '近 7 天日照辐射：中', { reliability: 'third_party' })
  ]
}

const temporary = {
  contractVersion: 'diagnosis-context-summary/v1',
  caseKind: 'temporary_case',
  generatedAt: '2026-10-10T12:00:00Z',
  facts: [
    fact('placement', '上海，阳台'),
    fact('climate_profile', '亚热带湿润气候', {
      observedAt: null,
      ageDays: null,
      reliability: 'third_party',
      freshness: 'unknown'
    })
  ]
}

function createValidator() {
  assert.ok(fs.existsSync(schemaPath), `缺少诊断上下文摘要 Schema：${schemaPath}`)
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8')) as object
  return new Ajv2020({ allErrors: true, strict: true }).compile(schema)
}

describe('诊断上下文摘要内部合同 v1', () => {
  test('接受长期植物与临时案例的事实摘要', () => {
    expect(createValidator()(longTerm)).toBe(true)
    expect(createValidator()(temporary)).toBe(true)
  })

  // 长度上限：最多 12 条、每条 ≤40 字，合计约 600 tokens 以内。
  test('拒绝超过 12 条事实或单条超过 40 字', () => {
    const many = { ...longTerm, facts: Array.from({ length: 13 }, () => fact('plant_identity')) }
    expect(createValidator()(many)).toBe(false)
    const long = { ...longTerm, facts: [fact('plant_identity', '长'.repeat(41))] }
    expect(createValidator()(long)).toBe(false)
  })

  // 隐私：不传坐标、地址或昵称等额外字段，也不允许在事实文本里夹带经纬度。
  test.each([
    ['坐标字段', { ...longTerm, latitude: 31.23 }],
    ['事实附加字段', { ...longTerm, facts: [{ ...fact('placement'), address: '某路 1 号' }] }],
    ['事实文本含经纬度', { ...longTerm, facts: [fact('placement', '位置 31.2304, 121.4737')] }]
  ])('拒绝位置隐私泄露：%s', (_name, value) => {
    expect(createValidator()(value)).toBe(false)
  })

  // 闭集键：症状出现时间等只在追问中使用，不属于长期上下文。
  test.each(['symptom_onset', 'user_note', 'nickname'])('拒绝未登记的事实键：%s', key => {
    expect(createValidator()({ ...longTerm, facts: [fact(key)] })).toBe(false)
  })

  // 临时案例只能给植物身份、百科需求、城市级位置、辐射与气候剖面。
  test('临时案例不得包含养护记录类事实', () => {
    expect(
      createValidator()({ ...temporary, facts: [...temporary.facts, fact('watering_history')] })
    ).toBe(false)
  })

  test('拒绝非法的可信度或时效枚举', () => {
    expect(
      createValidator()({
        ...longTerm,
        facts: [fact('plant_identity', 'x', { reliability: 'guess' })]
      })
    ).toBe(false)
    expect(
      createValidator()({ ...longTerm, facts: [fact('plant_identity', 'x', { freshness: 'old' })] })
    ).toBe(false)
  })

  // 路由登记：诊断专用的内部只读接口，独立 scope，不复用通用 context 路由。
  test('路由登记表包含诊断上下文内部只读路由', () => {
    const registry = JSON.parse(fs.readFileSync(routeRegistryPath, 'utf8')) as {
      routes: Record<string, unknown>[]
    }
    const route = registry.routes.find(item => item.operationId === 'getDiagnosisContextInternal')
    expect(route).toMatchObject({
      method: 'GET',
      path: '/api/v2/internal/user-plants/{userPlantRef}/diagnosis-context',
      owner: 'user-plant',
      security: 'service',
      requiredScope: 'user-plant.diagnosis-context.read',
      responseContract: 'DiagnosisContextSummary',
      idempotency: 'not_applicable'
    })
  })

  test('合同注册表登记合同正文与 Schema 且哈希一致', () => {
    const registry = JSON.parse(fs.readFileSync(contractRegistryPath, 'utf8')) as {
      contracts: { id: string; file: string; sha256: string }[]
    }
    for (const id of ['diagnosis-context-summary', 'diagnosis-context-summary-schema']) {
      const entry = registry.contracts.find(item => item.id === id)
      assert.ok(entry, `注册表缺少 ${id}`)
      const content = fs.readFileSync(path.join(root, 'docs/backend-v2/contracts', entry.file))
      expect(entry.sha256).toBe(createHash('sha256').update(content).digest('hex'))
    }
  })
})
