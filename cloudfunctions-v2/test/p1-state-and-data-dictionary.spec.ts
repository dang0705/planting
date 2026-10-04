import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'vitest'

import { findProjectRoot } from './support/project-root.js'

// Expected 来源：Canonical Master Plan 第八、九章及 P1 退出条件。
// 测试层次：unit_real_data；验证真实版本化数据制品，不访问数据库或旧实现。
test('P1 状态机与数据字典覆盖已冻结的核心状态和表', () => {
const projectRoot = findProjectRoot()
const stateMachine = fs.readFileSync(path.join(projectRoot, 'docs/backend-v2/data/state-machines.md'), 'utf8')
const dataDictionaryPath = path.join(projectRoot, 'docs/backend-v2/data/v2-data-dictionary.md')

// 用户批准的统一 Ephemeral 与 Care v2 已升级状态机，旧 v1 不再是有效合同。
assert.match(stateMachine, /合同版本[：:]\s*`state-machines\/v2`/u)
for (const transition of [
  'unidentified → candidate_pending → confirmed',
  'active → completed / failed / expired',
  'requested → processing → completed / failed',
  'reserved → settled / released / pending_reconciliation',
  'pending_reconciliation → settled / released',
  'received → applied / rejected',
  'requested → committed / rejected',
  'committed → reversed',
]) {
  assert.ok(stateMachine.includes(transition), `状态机缺少转换：${transition}`)
}
assert.ok(stateMachine.includes('superseded 只属于身份历史'))
assert.ok(stateMachine.includes('客户端不能提交分值'))

assert.ok(fs.existsSync(dataDictionaryPath), '缺少 v2 数据字典')
const dictionary = fs.readFileSync(dataDictionaryPath, 'utf8')
assert.match(dictionary, /数据字典版本[：:]\s*`backend-v2-data\/v1`/u)
for (const table of [
  'users',
  'platform_identities',
  'user_plants',
  'guest_plant_cases',
  'guest_claim_commands',
  'care_point_ledger',
  'ai_quota_grants',
  'ai_quota_reservations',
  'ai_quota_reservation_allocations',
  'subscription_reward_inbox',
]) {
  assert.ok(dictionary.includes(`\`${table}\``), `数据字典缺少表：${table}`)
}
for (const rule of ['BIGINT UNSIGNED', '内部主键永不进入公开响应', 'UTC 毫秒', '中文注释']) {
  assert.ok(dictionary.includes(rule), `数据字典缺少规则：${rule}`)
}

})
