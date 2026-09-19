import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

import { createPublicContractValidators } from '../src/contracts/index.js'
import { findProjectRoot } from './support/project-root.js'

// Expected 来源：principal-capability/v1、身份语义裁决和固定 HTTP 服务签名合同。
// 测试层次：unit_real_data + unit_fake；读取真实 DDL，并验证严格 AJV 合同，不访问 CloudBase。
describe('P1 统一身份与能力快照基础', () => {
  const validators = createPublicContractValidators()
  const projectRoot = findProjectRoot()
  const identitySql = fs.readFileSync(
    path.join(projectRoot, 'docs/backend-v2/schema/001_identity.sql'),
    'utf8'
  )
  const userPlantSql = fs.readFileSync(
    path.join(projectRoot, 'docs/backend-v2/schema/003_user_plant.sql'),
    'utf8'
  )
  const subscriptionSql = fs.readFileSync(
    path.join(projectRoot, 'docs/backend-v2/schema/005_subscription.sql'),
    'utf8'
  )
  const stateMachines = fs.readFileSync(
    path.join(projectRoot, 'docs/backend-v2/data/state-machines.md'),
    'utf8'
  )

  test('CapabilitySnapshot 严格区分游客和登录用户且拒绝内部字段扩散', () => {
    expect(
      validators.capabilitySnapshot({
        contractVersion: 'capability-snapshot/v1',
        snapshotRef: 'cps_01J8Z3H4R57V4G2QPG6C5W8K9M',
        subjectType: 'user',
        user_id: 'usr_01J8Z3H4R57V4G2QPG6C5W8K9M',
        tier: 'trial',
        allowedCapabilities: [
          'PLANT_IDENTIFICATION',
          'REWARDED_AI',
          'USER_AGENT_TEXT',
          'USER_DIAGNOSIS_TEXT',
          'USER_DIAGNOSIS_VISUAL'
        ],
        rewardedAiScopes: ['USER_AGENT_TEXT', 'USER_DIAGNOSIS_TEXT'],
        activeUserPlantLimit: 1,
        generatedAt: '2026-09-20T00:00:00.000Z',
        validUntil: '2026-09-20T00:05:00.000Z',
        policyVersion: 'capability/2026-09-20.1'
      })
    ).toBe(true)

    expect(
      validators.capabilitySnapshot({
        contractVersion: 'capability-snapshot/v1',
        snapshotRef: 'cps_01J8Z3H4R57V4G2QPG6C5W8K9M',
        subjectType: 'guest',
        user_id: 'usr_forbidden',
        tier: 'guest',
        allowedCapabilities: ['plant.identify'],
        rewardedAiScopes: [],
        activeUserPlantLimit: 0,
        generatedAt: '2026-09-20T00:00:00.000Z',
        validUntil: '2026-09-20T00:05:00.000Z',
        policyVersion: 'capability/2026-09-20.1'
      })
    ).toBe(false)

    expect(
      validators.capabilitySnapshot({
        contractVersion: 'capability-snapshot/v1',
        snapshotRef: 'cps_01J8Z3H4R57V4G2QPG6C5W8K9M',
        subjectType: 'guest',
        tier: 'guest',
        allowedCapabilities: ['PLANT_IDENTIFICATION'],
        rewardedAiScopes: ['USER_AGENT_TEXT'],
        activeUserPlantLimit: 0,
        generatedAt: '2026-09-20T00:00:00.000Z',
        validUntil: '2026-09-20T00:05:00.000Z',
        policyVersion: 'capability/2026-09-20.1'
      })
    ).toBe(false)

    expect(
      validators.capabilitySnapshot({
        contractVersion: 'capability-snapshot/v1',
        snapshotRef: 'cps_01J8Z3H4R57V4G2QPG6C5W8K9M',
        subjectType: 'user',
        user_id: 'usr_01J8Z3H4R57V4G2QPG6C5W8K9M',
        tier: 'free',
        allowedCapabilities: ['UNPUBLISHED_CAPABILITY'],
        rewardedAiScopes: [],
        activeUserPlantLimit: 1,
        generatedAt: '2026-09-20T00:00:00.000Z',
        validUntil: '2026-09-20T00:05:00.000Z',
        policyVersion: 'capability/2026-09-20.1'
      })
    ).toBe(false)

    expect(
      validators.capabilitySnapshot({
        contractVersion: 'capability-snapshot/v1',
        snapshotRef: 'cps_01J8Z3H4R57V4G2QPG6C5W8K9M',
        subjectType: 'user',
        user_id: 'usr_01J8Z3H4R57V4G2QPG6C5W8K9M',
        tier: 'free',
        allowedCapabilities: ['PLANT_IDENTIFICATION'],
        rewardedAiScopes: [],
        activeUserPlantLimit: 1,
        generatedAt: '2026-09-20T00:05:00.000Z',
        validUntil: '2026-09-20T00:00:00.000Z',
        policyVersion: 'capability/2026-09-20.1'
      })
    ).toBe(false)
  })

  test('平台绑定、会话和服务签名只保存摘要并具备原子防重放约束', () => {
    expect(identitySql).toContain(
      'UNIQUE KEY `uq_platform_subject` (`platform`, `app_scope`, `platform_subject_hash`)'
    )
    expect(identitySql).toContain('`session_ref_hash` CHAR(64) NOT NULL')
    expect(identitySql).not.toContain('`session_ref` VARCHAR')
    expect(identitySql).toContain(
      "`subject_hash_algorithm` VARCHAR(24) NOT NULL DEFAULT 'HMAC-SHA-256'"
    )
    expect(identitySql).toContain('`subject_hash_key_version` VARCHAR(64) NOT NULL')
    for (const field of ['key_id', 'request_timestamp_ms', 'body_sha256', 'scope_code']) {
      expect(identitySql).toContain(`\`${field}\``)
    }
    // nonce 在同一服务的有效窗口内只能消费一次；更换 key_id 也不得绕过防重放。
    expect(identitySql).toContain('UNIQUE KEY `uq_service_nonce` (`service_name`, `nonce_hash`)')
    // 一条会话必须同时约束同一用户和同一认证平台，禁止跨用户拼接平台身份。
    expect(identitySql).toContain(
      'FOREIGN KEY (`platform_identity_internal_id`, `user_internal_id`, `authenticated_via`) REFERENCES `platform_identities` (`id`, `user_internal_id`, `platform`)'
    )
    // 会话轮换链不能跨越统一用户。
    expect(identitySql).toContain(
      'FOREIGN KEY (`rotated_from_session_internal_id`, `user_internal_id`) REFERENCES `user_sessions` (`id`, `user_internal_id`)'
    )
    expect(identitySql).toContain(
      'UNIQUE KEY `uq_platform_identity_active_slot` (`user_internal_id`, `platform`, `app_scope`, `active_slot`)'
    )
  })

  test('游客持有证明支持版本化轮换且能力快照可审计', () => {
    expect(userPlantSql).toContain('`possession_proof_version` INT UNSIGNED NOT NULL')
    expect(userPlantSql).toContain('`previous_possession_proof_hash` CHAR(64) NULL')
    expect(userPlantSql).toContain('`proof_version` INT UNSIGNED NOT NULL')
    expect(subscriptionSql).toContain('CREATE TABLE `capability_snapshots`')
    expect(subscriptionSql).toContain('`snapshot_sha256` CHAR(64) NOT NULL')
  })

  test('身份、会话、游客证明和认领命令的状态与时间不变量由 DDL 拒绝非法组合', () => {
    for (const expectedConstraint of [
      "CONSTRAINT `ck_users_status` CHECK (`status` IN ('active', 'suspended', 'deleting', 'deleted'))",
      'CONSTRAINT `ck_platform_identity_revocation`',
      'CONSTRAINT `ck_user_session_time` CHECK (`expires_at_ms` > `issued_at_ms`)',
      'CONSTRAINT `ck_user_session_revocation`',
      'CONSTRAINT `ck_guest_session_proof_version` CHECK (`possession_proof_version` > 0)',
      'CONSTRAINT `ck_guest_session_previous_proof`',
      '`processing_lease_owner_hash` CHAR(64) NULL',
      '`processing_lease_expires_at_ms` BIGINT UNSIGNED NULL',
      '`attempt_count` INT UNSIGNED NOT NULL DEFAULT 0',
      'CONSTRAINT `ck_guest_claim_processing_lease`',
      'CONSTRAINT `ck_guest_claim_completed_target`'
    ]) {
      expect(`${identitySql}\n${userPlantSql}`).toContain(expectedConstraint)
    }
  })

  test('统一用户、平台绑定和登录会话具有显式状态机与不可绕过的解绑规则', () => {
    for (const expectedRule of [
      'active → suspended / deleting',
      'suspended → active / deleting',
      'deleting → deleted',
      'active → revoked / conflicted',
      'revoked → active / conflicted',
      'active → revoked / expired',
      '最后一个 active 平台绑定不得通过解绑接口删除',
      '解绑和风险处置必须递增 `users.session_version`',
      '同一用户在同一 `(platform, app_scope)` 最多一个 active 绑定'
    ]) {
      expect(stateMachines).toContain(expectedRule)
    }
  })

  test('身份 DDL 固定公开引用、摘要格式、算法和可表达的时间边界', () => {
    // Expected 来源：principal-capability/v1、http-api/v1、state-machines/v1、数据字典。
    // 这些是数据库可以独立拒绝的非法值；跨表状态解析和验签原子性不在本测试范围。
    for (const expectedConstraint of [
      "CONSTRAINT `ck_users_public_ref` CHECK (REGEXP_LIKE(`public_user_id`, '^usr_[A-Za-z0-9_-]{8,}$', 'c'))",
      'CONSTRAINT `ck_users_time` CHECK (`updated_at_ms` >= `created_at_ms`)',
      "CONSTRAINT `ck_platform_identity_subject_hash` CHECK (REGEXP_LIKE(`platform_subject_hash`, '^[0-9a-f]{64}$', 'c'))",
      "CONSTRAINT `ck_platform_identity_hash_algorithm` CHECK (`subject_hash_algorithm` = 'HMAC-SHA-256')",
      "CONSTRAINT `ck_platform_identity_key_version` CHECK (REGEXP_LIKE(`subject_hash_key_version`, '^[A-Za-z0-9._-]{1,64}$', 'c'))",
      'CONSTRAINT `ck_platform_identity_time` CHECK (`bound_at_ms` >= `created_at_ms` AND `updated_at_ms` >= `created_at_ms` AND (`revoked_at_ms` IS NULL OR `revoked_at_ms` >= `bound_at_ms`))',
      "CONSTRAINT `ck_user_session_hash` CHECK (REGEXP_LIKE(`session_ref_hash`, '^[0-9a-f]{64}$', 'c'))",
      'CONSTRAINT `ck_user_session_version` CHECK (`session_version` > 0)',
      'CONSTRAINT `ck_user_session_time_order` CHECK (`issued_at_ms` >= `created_at_ms` AND `updated_at_ms` >= `created_at_ms`)',
      'CONSTRAINT `ck_user_session_revoked_time` CHECK (`revoked_at_ms` IS NULL OR (`revoked_at_ms` >= `issued_at_ms` AND `revoked_at_ms` < `expires_at_ms`))',
      "CONSTRAINT `ck_service_nonce_hash` CHECK (REGEXP_LIKE(`nonce_hash`, '^[0-9a-f]{64}$', 'c'))",
      "CONSTRAINT `ck_service_nonce_body_hash` CHECK (REGEXP_LIKE(`body_sha256`, '^[0-9a-f]{64}$', 'c'))",
      'CONSTRAINT `ck_service_nonce_time` CHECK (`expires_at_ms` > `verified_at_ms` AND `verified_at_ms` >= `created_at_ms` AND `updated_at_ms` >= `created_at_ms`)'
    ]) {
      expect(identitySql).toContain(expectedConstraint)
    }

    // conflicted 不是 revoked：不能携带撤销时间，避免把冲突记录伪装成已撤销绑定。
    expect(identitySql).toContain(
      "CONSTRAINT `ck_platform_identity_revocation` CHECK ((`binding_status` = 'active' AND `revoked_at_ms` IS NULL) OR (`binding_status` = 'revoked' AND `revoked_at_ms` IS NOT NULL) OR (`binding_status` = 'conflicted' AND `revoked_at_ms` IS NULL))"
    )
  })
})
