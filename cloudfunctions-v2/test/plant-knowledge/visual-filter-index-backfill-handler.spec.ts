import { describe, expect, it } from 'vitest'

import type {
  VisualFilterIndexBuildInput,
  VisualFilterIndexBuildReport
} from '../../src/plant-knowledge/visual-filter-index/build-visual-filter-index.js'
import { createVisualFilterIndexBackfillHandler } from '../../src/plant-knowledge/visual-filter-index/visual-filter-index-backfill-handler.js'
import { plantKnowledgePublicSearchRulesV2 } from '../support/business-policy-fixtures.js'

/**
 * Expected：主代理 2026-10-10 转达用户授权「一次性云函数在内网跑回填」的事件合同——
 * event = { release: 'plant-knowledge-public-search/v2.0.0', batchSize, apply, maxRunMs? }；
 * 时长预算 = 函数超时（上下文 time_limit_in_ms）的 70%，与可选 maxRunMs 取小；用完即保存断点退出，返回
 * { status, nextEncyclopediaId, processedBatches, plantCount }；可重复调用续跑，就绪后再调为空操作。
 * 层次：L1 / unit_fake（只替换回填用例与时钟）。真实库续跑见 test/e2e/visual-filter-index-backfill.mysql.spec.ts。
 */
const sources = plantKnowledgePublicSearchRulesV2().visualAxisSources!
const report = (
  overrides: Partial<VisualFilterIndexBuildReport> = {}
): VisualFilterIndexBuildReport => ({
  status: 'paused',
  sourceKey: 'a'.repeat(64),
  filterSetId: 7,
  batches: 3,
  plantCount: null,
  nextEncyclopediaId: 15000,
  bitCounts: { LEAF_SHAPE: 15, GROWTH_FORM: 7, LEAF_SURFACE: 8 },
  ...overrides
})

function setup(result = report(), clock = { t: 1_000 }) {
  const inputs: VisualFilterIndexBuildInput[] = []
  const handler = createVisualFilterIndexBackfillHandler({
    build: async input => {
      inputs.push(input)
      return result
    },
    now: () => clock.t
  })
  return { handler, inputs, clock }
}

const validEvent = { release: 'plant-knowledge-public-search/v2.0.0', batchSize: 5000, apply: true }

describe('visual-filter-index-backfill 事件入口', () => {
  it('合法事件：按 v2 发布文档的三轴版本回填，返回计数摘要（不含内部 id 与数据）', async () => {
    const { handler, inputs } = setup()
    await expect(handler(validEvent, { time_limit_in_ms: 900_000 })).resolves.toEqual({
      status: 'paused',
      sourceKey: 'a'.repeat(64),
      nextEncyclopediaId: 15000,
      processedBatches: 3,
      plantCount: null
    })
    expect(inputs).toHaveLength(1)
    expect(inputs[0]).toMatchObject({ sources, batchSize: 5000, apply: true, nowMs: 1_000 })
  })

  it('时长预算 = 函数超时的 70%：预算内继续，到点后停止', async () => {
    const { handler, inputs, clock } = setup()
    await handler(validEvent, { time_limit_in_ms: 100_000 })
    const shouldContinue = inputs[0]!.shouldContinue!
    clock.t = 1_000 + 69_999
    expect(shouldContinue()).toBe(true)
    clock.t = 1_000 + 70_000
    expect(shouldContinue()).toBe(false)
  })

  it('maxRunMs 比 70% 更短时取 maxRunMs', async () => {
    const { handler, inputs, clock } = setup()
    await handler({ ...validEvent, maxRunMs: 5_000 }, { time_limit_in_ms: 900_000 })
    clock.t = 1_000 + 5_000
    expect(inputs[0]!.shouldContinue!()).toBe(false)
  })

  it('上下文无超时但给了 maxRunMs：按 maxRunMs', async () => {
    const { handler, inputs, clock } = setup()
    await handler({ ...validEvent, maxRunMs: 2_000 }, {})
    clock.t = 2_999
    expect(inputs[0]!.shouldContinue!()).toBe(true)
    clock.t = 3_000
    expect(inputs[0]!.shouldContinue!()).toBe(false)
  })

  it('取不到超时且未给 maxRunMs → not_started，不调用回填', async () => {
    const { handler, inputs } = setup()
    await expect(handler(validEvent, { time_limit_in_ms: '900000' })).resolves.toEqual({
      status: 'not_started',
      reason: 'TIME_LIMIT_UNKNOWN'
    })
    expect(inputs).toHaveLength(0)
  })

  it('apply=false 原样传给回填（只读演练）', async () => {
    const { handler, inputs } = setup(
      report({ status: 'dry_run', batches: 55, nextEncyclopediaId: 0 })
    )
    await expect(
      handler({ ...validEvent, apply: false }, { time_limit_in_ms: 900_000 })
    ).resolves.toMatchObject({
      status: 'dry_run',
      processedBatches: 55
    })
    expect(inputs[0]!.apply).toBe(false)
  })

  it.each([
    ['缺 release', { batchSize: 5000, apply: true }],
    ['未知发布版本', { ...validEvent, release: 'plant-knowledge-public-search/v1.0.0' }],
    ['batchSize 为 0', { ...validEvent, batchSize: 0 }],
    ['batchSize 超过 8000（预处理语句占位符上限）', { ...validEvent, batchSize: 8_001 }],
    ['batchSize 为小数', { ...validEvent, batchSize: 1.5 }],
    ['apply 为字符串', { ...validEvent, apply: 'true' }],
    ['缺 apply', { release: validEvent.release, batchSize: 5000 }],
    ['maxRunMs 为 0', { ...validEvent, maxRunMs: 0 }],
    ['混入未知字段', { ...validEvent, sources: { LEAF_SHAPE: 'visual-axis-v2' } }],
    ['事件不是对象', 'run']
  ])('%s → rejected，不调用回填', async (_label, event) => {
    const { handler, inputs } = setup()
    await expect(handler(event, { time_limit_in_ms: 900_000 })).resolves.toEqual({
      status: 'rejected',
      reason: 'INVALID_EVENT'
    })
    expect(inputs).toHaveLength(0)
  })
})
