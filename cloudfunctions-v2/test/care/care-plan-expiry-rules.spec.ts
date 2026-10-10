import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  CARE_PLAN_EXPIRY_GRACE_HOURS,
  CARE_PLAN_EXPIRY_SCAN,
  isCarePlanExpired,
  resolveCarePlanExpiryCutoffMs,
  resolveExpiryRunDeadlineMs
} from '../../src/care/domain/care-plan-expiry-rules.js'
import { findProjectRoot } from '../support/project-root.js'

/**
 * L1（unit_fake 规则 + 配置目录 unit_real_data）。
 * Expected：long-term-care-contract.md §12.1/§12.5（用户 2026-10-09 裁决：定时任务写入过期）与配置目录
 * care.plans.expiry_grace_hours=72（主代理 2026-10-09 裁决，与 soilEvidenceMaxHours=72 对齐；同日裁定改为 hard_rule）、
 * care.plans.expiry_scan={每小时、每批 500、时长上限=函数超时一半}。
 * 真实经过：纯函数与真实配置目录 JSON、真实 v2 浇水策略发布正文；未覆盖：MySQL、触发器。
 */
const hour = 3_600_000
const now = Date.UTC(2026, 9, 9, 4)
const root = findProjectRoot()
const catalog = JSON.parse(readFileSync(join(root, 'docs/backend-v2/architecture/configuration-variable-catalog.json'), 'utf8')) as {
  variables: Array<{ id: string; currentValue: unknown; status: string; layer: string; owner: string }>
}
const variable = (id: string) => catalog.variables.find(item => item.id === id)

describe('计划过期规则（§12）', () => {
  // 主代理 2026-10-09 裁定：两项改为 hard_rule（代码常量 + 目录一致性测试 + 合同共同保证，不走策略 release）。
  it('常量与配置目录一致，且为不可配置硬规则、owner=care', () => {
    expect(variable('care.plans.expiry_grace_hours')).toMatchObject({ layer: 'hard_rule', status: 'hard_rule', owner: 'care', currentValue: 72 })
    expect(variable('care.plans.expiry_scan')).toMatchObject({ layer: 'hard_rule', status: 'hard_rule', owner: 'care' })
    expect(CARE_PLAN_EXPIRY_GRACE_HOURS).toBe(variable('care.plans.expiry_grace_hours')?.currentValue)
    expect(CARE_PLAN_EXPIRY_SCAN).toEqual(variable('care.plans.expiry_scan')?.currentValue)
    expect(CARE_PLAN_EXPIRY_SCAN).toEqual({ cron: '0 0 * * * * *', intervalHours: 1, batchSize: 500, runBudgetFractionOfFunctionTimeout: 0.5 })
  })

  it('72 小时与 care-watering-mvp/v2 的 soilEvidenceMaxHours 对齐', () => {
    const release = JSON.parse(readFileSync(join(root, 'cloudfunctions-v2/models/care/mvp-watering-policy-release.v2.json'), 'utf8')) as Record<string, unknown>
    const text = JSON.stringify(release)
    expect(text).toMatch(/"soilEvidenceMaxHours":72\b/u)
    expect(CARE_PLAN_EXPIRY_GRACE_HOURS).toBe(72)
  })

  it('截止时刻 = 现在 − 72 小时', () => {
    expect(resolveCarePlanExpiryCutoffMs(now)).toBe(now - 72 * hour)
  })

  it('严格大于：恰好 72 小时不过期，多 1 毫秒过期', () => {
    expect(isCarePlanExpired({ status: 'planned', scheduledAtMs: now - 72 * hour, nowMs: now })).toBe(false)
    expect(isCarePlanExpired({ status: 'planned', scheduledAtMs: now - 72 * hour - 1, nowMs: now })).toBe(true)
    expect(isCarePlanExpired({ status: 'planned', scheduledAtMs: now + hour, nowMs: now })).toBe(false)
  })

  it.each(['completed', 'cancelled', 'expired'])('终态 %s 永不判为待过期', status => {
    expect(isCarePlanExpired({ status, scheduledAtMs: now - 30 * 24 * hour, nowMs: now })).toBe(false)
  })

  it('单次运行时长上限 = 开始时刻 + 函数超时的一半（向下取整）', () => {
    expect(resolveExpiryRunDeadlineMs({ startedAtMs: now, functionTimeoutMs: 60_000 })).toBe(now + 30_000)
    expect(resolveExpiryRunDeadlineMs({ startedAtMs: now, functionTimeoutMs: 3_001 })).toBe(now + 1_500)
  })

  it.each([null, 0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('函数超时不可用（%s）→ null，不猜默认值', timeout => {
    expect(resolveExpiryRunDeadlineMs({ startedAtMs: now, functionTimeoutMs: timeout })).toBeNull()
  })
})
