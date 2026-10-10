import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  buildCareCalendar, isConfirmableWateringResult, resolveCheckScheduledAt, resolvePlanPageLimit, resolveProposalValidUntil, validateWateringOccurredAt
} from '../../src/care/domain/long-term-care-rules.js'
import { careLongTermRulesV1 } from '../support/business-policy-fixtures.js'
import { findProjectRoot } from '../support/project-root.js'

/**
 * L1（unit_fake 规则 + 配置目录 unit_real_data）。Expected：long-term-care-contract.md §2/§3/§5/§6/§9（用户 2026-10-09 裁决 U3/U5/U7/U9，
 * 主代理裁决 T5）与配置目录 care.facts.watering_backfill_max_days=7、care.plans.check_max_postpone_days=7、
 * care.watering.open_window_proposal_valid_hours=24、care.plans.page_size={default:20,max:50}。
 */
const hour = 3_600_000
const day = 24 * hour
const now = Date.UTC(2026, 9, 9, 4)
const catalog = JSON.parse(readFileSync(join(findProjectRoot(), 'docs/backend-v2/architecture/configuration-variable-catalog.json'), 'utf8')) as { variables: Array<{ id: string; currentValue: unknown }> }
const value = (id: string) => catalog.variables.find(item => item.id === id)?.currentValue

// 用户 2026-10-10 第三轮裁定：四项迁入策略发布 care/long_term_rules（取值不变）；规则函数改为显式接收策略快照。
const rules = careLongTermRulesV1()

describe('长期养护规则', () => {
  it('策略 v1 取值与配置目录一致', () => {
    expect(rules.wateringBackfillMaxDays).toBe(value('care.facts.watering_backfill_max_days'))
    expect(rules.checkMaxPostponeDays).toBe(value('care.plans.check_max_postpone_days'))
    expect(rules.openWindowProposalValidHours).toBe(value('care.watering.open_window_proposal_valid_hours'))
    expect(rules.planPageSize).toEqual(value('care.plans.page_size'))
    expect([rules.wateringBackfillMaxDays, rules.checkMaxPostponeDays, rules.openWindowProposalValidHours, rules.planPageSize]).toEqual([7, 7, 24, { default: 20, max: 50 }])
  })
  it('取值来自策略而非代码：补记天数改为 3 天后，4 天前的浇水被拒', () => {
    const created = now - 30 * day
    expect(validateWateringOccurredAt({ occurredAtMs: now - 4 * day, nowMs: now, plantCreatedAtMs: created }, rules)).toBe(true)
    expect(validateWateringOccurredAt({ occurredAtMs: now - 4 * day, nowMs: now, plantCreatedAtMs: created }, { ...rules, wateringBackfillMaxDays: 3 })).toBe(false)
  })
  it('U3 浇水时刻：现在 ~ 7 天前（含边界）、不早于植物创建、不晚于现在', () => {
    const created = now - 30 * day
    expect(validateWateringOccurredAt({ occurredAtMs: now, nowMs: now, plantCreatedAtMs: created }, rules)).toBe(true)
    expect(validateWateringOccurredAt({ occurredAtMs: now - 7 * day, nowMs: now, plantCreatedAtMs: created }, rules)).toBe(true)
    expect(validateWateringOccurredAt({ occurredAtMs: now - 7 * day - 1, nowMs: now, plantCreatedAtMs: created }, rules)).toBe(false)
    expect(validateWateringOccurredAt({ occurredAtMs: now + 1, nowMs: now, plantCreatedAtMs: created }, rules)).toBe(false)
    expect(validateWateringOccurredAt({ occurredAtMs: now - 2 * day, nowMs: now, plantCreatedAtMs: now - day }, rules)).toBe(false)
  })
  it('可确认行动：ready 且 water_allowed / check_later / check_now / priority_check', () => {
    const result = (status: string, action: string) => ({ status, details: { action } }) as never
    for (const action of ['water_allowed', 'check_later', 'check_now', 'priority_check']) { expect(isConfirmableWateringResult(result('ready', action))).toBe(true) }
    for (const action of ['pause_watering', 'review_drainage', 'insufficient_evidence']) { expect(isConfirmableWateringResult(result('ready', action))).toBe(false) }
    expect(isConfirmableWateringResult(result('insufficient_evidence', 'check_later'))).toBe(false)
  })
  it('U7 建议有效期：检查窗口最晚端；无最晚端 → 生成 + 24h', () => {
    const generatedAt = new Date(now).toISOString()
    expect(resolveProposalValidUntil({ generatedAt, details: { checkWindow: { latestAt: new Date(now + 3 * day).toISOString() } } } as never, rules)).toBe(now + 3 * day)
    expect(resolveProposalValidUntil({ generatedAt, details: { checkWindow: { latestAt: null } } } as never, rules)).toBe(now + 24 * hour)
    expect(resolveProposalValidUntil({ generatedAt, details: { checkWindow: null } } as never, rules)).toBe(now + 24 * hour)
    // Q1（主代理 2026-10-09）：最晚端不晚于生成时刻 → 视为无最晚端。
    expect(resolveProposalValidUntil({ generatedAt, details: { checkWindow: { latestAt: generatedAt } } } as never, rules)).toBe(now + 24 * hour)
    expect(resolveProposalValidUntil({ generatedAt, details: { checkWindow: { latestAt: new Date(now - hour).toISOString() } } } as never, rules)).toBe(now + 24 * hour)
    expect(resolveProposalValidUntil({ generatedAt, details: { checkWindow: { latestAt: new Date(now + 1).toISOString() } } } as never, rules)).toBe(now + 1)
  })
  it('U5 检查时刻：缺省最早端（无则现在）；只能在窗口内；无最晚端最多推 7 天', () => {
    const earliest = now + day, latest = now + 5 * day
    expect(resolveCheckScheduledAt({ requestedMs: null, earliestMs: earliest, latestMs: latest, nowMs: now, generatedAtMs: now }, rules)).toBe(earliest)
    expect(resolveCheckScheduledAt({ requestedMs: null, earliestMs: null, latestMs: null, nowMs: now, generatedAtMs: now }, rules)).toBe(now)
    expect(resolveCheckScheduledAt({ requestedMs: now + 2 * day, earliestMs: earliest, latestMs: latest, nowMs: now, generatedAtMs: now }, rules)).toBe(now + 2 * day)
    expect(resolveCheckScheduledAt({ requestedMs: now + 6 * day, earliestMs: earliest, latestMs: latest, nowMs: now, generatedAtMs: now }, rules)).toBeNull()
    expect(resolveCheckScheduledAt({ requestedMs: earliest - 1, earliestMs: earliest, latestMs: latest, nowMs: now, generatedAtMs: now }, rules)).toBeNull()
    expect(resolveCheckScheduledAt({ requestedMs: earliest + 7 * day, earliestMs: earliest, latestMs: null, nowMs: now, generatedAtMs: now }, rules)).toBe(earliest + 7 * day)
    expect(resolveCheckScheduledAt({ requestedMs: earliest + 7 * day + 1, earliestMs: earliest, latestMs: null, nowMs: now, generatedAtMs: now }, rules)).toBeNull()
    expect(resolveCheckScheduledAt({ requestedMs: now + 7 * day + 1, earliestMs: null, latestMs: null, nowMs: now, generatedAtMs: now }, rules)).toBeNull()
    // Q5（主代理 2026-10-09）：缺省 = max(最早端, 现在)，不落在过去。
    expect(resolveCheckScheduledAt({ requestedMs: null, earliestMs: now - day, latestMs: now + day, nowMs: now, generatedAtMs: now }, rules)).toBe(now)
    // 自选范围（主代理 2026-10-09，与 Q1 一致）：下界 max(最早端, 现在)；最晚端不晚于生成时刻 → 无最晚端，上界 = 最早端 + 7 天。
    expect(resolveCheckScheduledAt({ requestedMs: now - 1, earliestMs: now - day, latestMs: now + day, nowMs: now, generatedAtMs: now }, rules)).toBeNull()
    expect(resolveCheckScheduledAt({ requestedMs: now + 3 * day, earliestMs: now, latestMs: now, nowMs: now, generatedAtMs: now }, rules)).toBe(now + 3 * day)
    expect(resolveCheckScheduledAt({ requestedMs: now + 7 * day, earliestMs: now, latestMs: now - hour, nowMs: now, generatedAtMs: now }, rules)).toBe(now + 7 * day)
    expect(resolveCheckScheduledAt({ requestedMs: now + 7 * day + 1, earliestMs: now, latestMs: now, nowMs: now, generatedAtMs: now }, rules)).toBeNull()
    expect(resolveCheckScheduledAt({ requestedMs: now + 2 * hour, earliestMs: now, latestMs: now + hour, nowMs: now, generatedAtMs: now }, rules)).toBeNull()
  })
  it('U9 日历：中文标题「检查{名称}盆土」，30 分钟，固定提示，无名称用「植物」', () => {
    expect(buildCareCalendar({ scheduledAtMs: now, displayName: '绿萝' })).toEqual({
      title: '检查绿萝盆土', startAt: new Date(now).toISOString(), endAt: new Date(now + 30 * 60_000).toISOString(),
      notes: '用手指插入土中 3～5 厘米检查干湿，再决定是否浇水。'
    })
    expect(buildCareCalendar({ scheduledAtMs: now, displayName: null }).title).toBe('检查植物盆土')
    expect(buildCareCalendar({ scheduledAtMs: now, displayName: '  ' }).title).toBe('检查植物盆土')
  })
  it('T5 分页：缺省 20；1～50 整数；其他非法', () => {
    expect(resolvePlanPageLimit(undefined, rules)).toBe(20)
    expect(resolvePlanPageLimit('50', rules)).toBe(50)
    expect(resolvePlanPageLimit('1', rules)).toBe(1)
    for (const raw of ['0', '51', '1.5', 'x', '']) { expect(resolvePlanPageLimit(raw, rules)).toBeNull() }
  })
})
