import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'vitest'

import { findProjectRoot } from './support/project-root.js'

/**
 * Expected 来源：care-points-ai-quota/v1、reward-events/v1、state-machines/v1 与
 * P1 订阅额度语义审计。测试层级：unit_real_data；读取真实 subscription DDL，
 * 不连接 MySQL，不能替代 P5 的真实事务、并发或回放验收。
 *
 * 覆盖矩阵：U2（额度及结算边界）、U3（非法状态与金额）、U4（同键重放）。
 */
test('subscription DDL 锁定额度守恒、兑换终态与奖励收件幂等约束', () => {
  const root = findProjectRoot()
  const sql = fs.readFileSync(
    path.join(root, 'docs/backend-v2/schema/005_subscription.sql'),
    'utf8'
  )

  for (const requiredRule of [
    "CONSTRAINT `ck_ai_grant_source_type` CHECK (`source_type` IN ('TRIAL', 'MEMBER', 'CMS_IDENTITY', 'CMS_CONTENT', 'CARE_LEVEL', 'CARE_REDEMPTION'))",
    "CONSTRAINT `ck_ai_grant_status` CHECK (`status` IN ('active', 'partially_used', 'used', 'expired', 'reversed'))",
    'CONSTRAINT `ck_ai_grant_expiry_after_grant` CHECK (`expires_at_ms` > `granted_at_ms`)',
    "CONSTRAINT `ck_subscription_status` CHECK (`status` IN ('pending', 'active', 'cancelled', 'expired', 'failed'))",
    "CONSTRAINT `ck_subscription_period_status` CHECK (`status` IN ('pending', 'active', 'expired', 'failed'))",
    'CONSTRAINT `ck_subscription_period_window` CHECK (`ends_at_ms` > `starts_at_ms`)',
    "CONSTRAINT `ck_ai_reservation_status` CHECK (`status` IN ('reserved', 'settled', 'released', 'pending_reconciliation'))",
    'CONSTRAINT `ck_ai_reservation_settlement_limit` CHECK (`settled_amount` IS NULL OR `settled_amount` <= `estimated_amount`)',
    "CONSTRAINT `ck_ai_reservation_terminal` CHECK ((`status` IN ('reserved', 'pending_reconciliation') AND `settled_amount` IS NULL) OR (`status` = 'settled' AND `settled_amount` IS NOT NULL) OR (`status` = 'released' AND `settled_amount` = 0))",
    'CONSTRAINT `ck_ai_allocation_positive` CHECK (`reserved_amount` > 0)',
    'CONSTRAINT `ck_ai_allocation_conservation` CHECK (`reserved_amount` = `settled_amount` + `released_amount`)',
    "CONSTRAINT `ck_ai_ledger_entry` CHECK (`entry_type` IN ('grant', 'reserve', 'settle', 'release', 'expire', 'reverse') AND `amount` > 0)",
    "CONSTRAINT `ck_ai_ledger_original` CHECK ((`entry_type` = 'reverse' AND `original_ledger_internal_id` IS NOT NULL) OR (`entry_type` <> 'reverse' AND `original_ledger_internal_id` IS NULL))",
    "CONSTRAINT `ck_care_point_ledger_entry` CHECK ((`entry_type` = 'grant' AND `amount` > 0 AND `original_ledger_internal_id` IS NULL) OR (`entry_type` = 'spend' AND `amount` < 0 AND `original_ledger_internal_id` IS NULL) OR (`entry_type` = 'reverse' AND `amount` <> 0 AND `original_ledger_internal_id` IS NOT NULL))",
    "CONSTRAINT `ck_redemption_status` CHECK (`status` IN ('requested', 'committed', 'rejected', 'reversed'))",
    "CONSTRAINT `ck_redemption_terminal_links` CHECK ((`status` = 'committed' AND `point_ledger_internal_id` IS NOT NULL AND `reversal_ledger_internal_id` IS NULL) OR (`status` = 'reversed' AND `point_ledger_internal_id` IS NOT NULL AND `reversal_ledger_internal_id` IS NOT NULL) OR (`status` IN ('requested', 'rejected') AND `point_ledger_internal_id` IS NULL AND `reversal_ledger_internal_id` IS NULL))",
    "CONSTRAINT `ck_reward_inbox_status` CHECK ((`status` = 'received' AND `applied_at_ms` IS NULL AND `result_ref` IS NULL AND `rejection_code` IS NULL) OR (`status` = 'applied' AND `applied_at_ms` IS NOT NULL AND `result_ref` IS NOT NULL AND `rejection_code` IS NULL) OR (`status` = 'rejected' AND `applied_at_ms` IS NULL AND `result_ref` IS NULL AND `rejection_code` IS NOT NULL))",
    'UNIQUE KEY `uq_reward_event` (`event_id`)',
    'UNIQUE KEY `uq_reward_business` (`business_unique_key`)',
    'UNIQUE KEY `uq_allocation_pair` (`reservation_internal_id`, `grant_internal_id`)'
  ]) {
    assert.ok(sql.includes(requiredRule), `subscription DDL 缺少语义约束：${requiredRule}`)
  }
})
