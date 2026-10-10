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
    expect(values).toMatchObject({
      'http.jsonBodyLimitBytes': 1_048_576,
      'http.idempotencyRetentionHours': 168,
      'identity.serviceSignatureClockSkewSeconds': 300,
      'identity.serviceSignatureNonceTtlSeconds': 600,
      'identity.wechatLoginTotalDeadlineMs': 5000,
      'identity.douyinLoginTotalDeadlineMs': 5000,
      'plantKnowledge.searchQueryMaxCodePoints': 64,
      'plantKnowledge.searchResultMaxItems': 20,
      'plantKnowledge.catalogDefaultLimit': 10,
      'plantKnowledge.catalogMinimumLimit': 1,
      'plantKnowledge.encyclopediaReferenceMaxCodePoints': 512,
      'care.planExpiryGraceHours': 72,
      'care.planExpiryScan': { cron: '0 0 * * * * *', intervalHours: 1, batchSize: 500, runBudgetFractionOfFunctionTimeout: 0.5 },
      'care.outboxDispatch': { cron: '0 * * * * * *', leaseSeconds: 30, batchSize: 100, maxAttempts: 5 },
      'care.dryingGapFillMaxHours': 6,
      'care.wateringBackfillMaxDays': 7,
      'care.checkMaxPostponeDays': 7,
      'care.openWindowProposalValidHours': 24,
      'care.planPageSize': { default: 20, max: 50 },
      'care.openMeteoTotalDeadlineMs': 8000,
      'care.openMeteoRequestWindowDays': { maxPastDays: 92, maxForecastDays: 16 },
      'storage.cloudbaseStorageTotalDeadlineMs': 10_000,
      'storage.uploadAllowedMimeTypes': ['image/jpeg', 'image/png', 'image/webp'],
      'storage.uploadMaxImageBytes': 5_242_880,
      'userPlant.guestClaimProcessingLeaseSeconds': 30,
      'userPlant.listPageSize': { default: 20, max: 50 },
      'userPlant.timelinePageSize': { default: 20, max: 50 },
      'userPlant.coverMaxCountPerPlant': 1,
      'userPlant.replacedCoverCleanupDays': 7,
      'weather.recommendTopMaxItems': 50
    })
  })

  it('复合值深度冻结，运行时不可被改写', () => {
    expect(Object.isFrozen(RUNTIME_PARAMETERS)).toBe(true)
    expect(Object.isFrozen(RUNTIME_PARAMETERS.care)).toBe(true)
    expect(Object.isFrozen(RUNTIME_PARAMETERS.care.outboxDispatch.value)).toBe(true)
    expect(Object.isFrozen(RUNTIME_PARAMETERS.care.planPageSize.value)).toBe(true)
  })
})
