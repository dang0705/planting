import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { RUNTIME_PARAMETERS, type RuntimeParameter } from '../../src/configuration/runtime-parameters.js'
import { findProjectRoot } from '../support/project-root.js'

/**
 * L1 / unit_real_data。
 * Expected 来源：真实配置目录 `configuration-variable-catalog.json`（变量 currentValue 与 Provider 档案字段，
 * 由用户 / 主代理裁决冻结）与设计说明 `configuration-layers.md` §2.3（注册表每项必须登记来源、取值与目录完全相等、
 * 不得收录 pending 项）。下列硬编码期望值逐项抄自目录当前冻结值，用于防止注册表与目录同时被误改。
 * 真实经过：读取真实目录 JSON 与注册表模块；未覆盖：运行时消费方是否真正使用（见源码扫描用例）。
 */
const root = findProjectRoot()
const catalog = JSON.parse(readFileSync(join(root, 'docs/backend-v2/architecture/configuration-variable-catalog.json'), 'utf8')) as {
  variables: Array<{ id: string; currentValue: unknown; status: string; layer: string }>
  providerProfiles: Array<Record<string, unknown> & { providerCode: string; status: string }>
}

/** 把两层分组的注册表摊平为「分组.名称 → 参数」。 */
function flattenRegistry(): Array<[string, RuntimeParameter<unknown>]> {
  return Object.entries(RUNTIME_PARAMETERS).flatMap(([group, entries]) =>
    Object.entries(entries as Record<string, RuntimeParameter<unknown>>).map(([name, parameter]) => [`${group}.${name}`, parameter] as [string, RuntimeParameter<unknown>]))
}

describe('代码层运行参数注册表（configuration-layers/v1 §2.3）', () => {
  it('每项都登记来源，且取值与配置目录完全相等、来源不是 pending', () => {
    const entries = flattenRegistry()
    expect(entries.length).toBeGreaterThan(0)
    for (const [name, parameter] of entries) {
      if (parameter.source.kind === 'catalog_variable') {
        const { catalogKey } = parameter.source
        const variable = catalog.variables.find(item => item.id === catalogKey)
        expect(variable, `${name} 引用的目录变量不存在：${catalogKey}`).toBeDefined()
        expect(variable?.status, `${name} 引用了 pending 变量`).not.toBe('pending')
        expect(parameter.value, `${name} 与目录 ${catalogKey} 不一致`).toEqual(variable?.currentValue)
      } else {
        const { providerCode, field } = parameter.source
        const profile = catalog.providerProfiles.find(item => item.providerCode === providerCode)
        expect(profile, `${name} 引用的 Provider 档案不存在：${providerCode}`).toBeDefined()
        expect(profile?.status, `${name} 引用了 pending Provider`).toBe('confirmed')
        expect(parameter.value, `${name} 与 Provider ${providerCode}.${field} 不一致`).toEqual(profile?.[field])
      }
      expect(Object.isFrozen(parameter), `${name} 必须只读`).toBe(true)
    }
  })

  it('已迁移参数的冻结值（独立 Expected，抄自目录）', () => {
    const values = Object.fromEntries(flattenRegistry().map(([name, parameter]) => [name, parameter.value]))
    // 用户 2026-10-10 第三轮裁定：业务参数迁入策略发布，代码注册表只保留运维默认值与硬边界。
    expect(values).toEqual({
      'http.jsonBodyLimitBytes': 1_048_576,
      'identity.serviceSignatureClockSkewSeconds': 300,
      'identity.serviceSignatureNonceTtlSeconds': 600,
      'identity.wechatLoginTotalDeadlineMs': 5000,
      'identity.douyinLoginTotalDeadlineMs': 5000,
      // 用户 2026-10-10 裁定：发件箱补扫与过期扫描合并为低频 care-maintenance-sweep（对齐 weather 醒库时段，最大间隔 4 小时）。
      'care.planExpiryScan': { cron: '0 25 0,4,7,11,14,16,19,21 * * * *', intervalHours: 4, batchSize: 500, runBudgetFractionOfFunctionTimeout: 0.5 },
      'care.outboxDispatch': { cron: '0 25 0,4,7,11,14,16,19,21 * * * *', leaseSeconds: 30, batchSize: 100, maxAttempts: 5 },
      'care.outboxInlineDispatchBudgetMs': 1500,
      'care.maintenanceSweep': { cron: '0 25 0,4,7,11,14,16,19,21 * * * *', maxGapHours: 4, outboxBudgetFractionOfFunctionTimeout: 0.3 },
      'care.openMeteoTotalDeadlineMs': 8000,
      'care.openMeteoRequestWindowDays': { maxPastDays: 92, maxForecastDays: 16 },
      'storage.cloudbaseStorageTotalDeadlineMs': 10_000,
      'userPlant.guestClaimProcessingLeaseSeconds': 30,
      'userPlant.coverMaxCountPerPlant': 1,
      'policyBounds.careLongTermRules': { planExpiryGraceHours: { min: 1, max: 720 }, wateringBackfillMaxDays: { min: 1, max: 90 }, checkMaxPostponeDays: { min: 1, max: 90 }, openWindowProposalValidHours: { min: 1, max: 168 }, planPageSizeMax: 50 },
      'policyBounds.careWateringRuntime': { dryingGapFillMaxHours: { min: 0, max: 24 }, maximumPpfdPerGhi: { min: 1.8, max: 3 }, indoorClimateWindowHours: { min: 1, max: 72 } },
      'policyBounds.plantKnowledgePublicSearch': { searchQueryMaxCodePoints: 255, searchResultMaxItems: 20, encyclopediaReferenceMaxCodePoints: 512, catalogMinimumLimit: 1, visualFilterMaxItems: 50 },  // 三轴筛选绝对上限 50（用户 2026-10-10 审定 plant-visual-axis-filter/v1）
      'policyBounds.weatherPublicRead': { recommendTopMax: 50 },
      'policyBounds.userPlantListRules': { pageSizeMax: 50 },
      'policyBounds.userPlantAssetRules': { replacedCoverCleanupDays: { min: 1, max: 90 }, maxImageBytes: { min: 65536, max: 10485760 }, supportedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'] },
      'policyBounds.httpRequestWrite': { idempotencyRetentionHours: { min: 24, max: 720 }, jsonBodyLimitBytes: 1048576 }
    })
  })

  it('复合值深度冻结，运行时不可被改写', () => {
    expect(Object.isFrozen(RUNTIME_PARAMETERS)).toBe(true)
    expect(Object.isFrozen(RUNTIME_PARAMETERS.care)).toBe(true)
    expect(Object.isFrozen(RUNTIME_PARAMETERS.care.outboxDispatch.value)).toBe(true)
    expect(Object.isFrozen(RUNTIME_PARAMETERS.policyBounds.careLongTermRules.value)).toBe(true)
  })
})
