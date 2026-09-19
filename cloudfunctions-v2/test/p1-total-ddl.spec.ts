import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'vitest'

import { findProjectRoot } from './support/project-root.js'

// Expected 来源：Master Plan P1 总 DDL/空库退出条件、v2 数据字典和表所有权合同。
// 测试层次：unit_real_data；读取真实 SQL 与 manifest，不连接数据库。
test('P1 总 DDL 满足空库重建和关键约束', () => {
  const root = findProjectRoot()
  const schemaRoot = path.join(root, 'docs/backend-v2/schema')
  const manifestPath = path.join(schemaRoot, 'manifest.json')

  assert.ok(fs.existsSync(manifestPath), '缺少总 DDL manifest')
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  assert.equal(manifest.schemaVersion, 'backend-v2-schema/v1')
  assert.ok(Array.isArray(manifest.files) && manifest.files.length >= 6, '总 DDL 必须按领域拆分')

  let sql = ''
  const FIRST_CAPTURE_INDEX = 1
  for (const entry of manifest.files) {
    assert.match(entry.file, /^\d{3}_[a-z0-9_]+\.sql$/u)
    const filePath = path.join(schemaRoot, entry.file)
    assert.ok(fs.existsSync(filePath), `缺少 DDL 文件：${entry.file}`)
    const content = fs.readFileSync(filePath, 'utf8')
    assert.equal(
      createHash('sha256').update(content).digest('hex'),
      entry.sha256,
      `${entry.file} SHA 不一致`
    )
    assert.ok(content.includes('ENGINE=InnoDB'), `${entry.file} 必须固定 InnoDB`)
    assert.ok(content.includes('DEFAULT CHARSET=utf8mb4'), `${entry.file} 必须固定 utf8mb4`)
    assert.doesNotMatch(
      content,
      /\b(?:DROP|ALTER|INSERT|UPDATE|DELETE)\b/iu,
      `${entry.file} 只允许空库 CREATE`
    )
    assert.doesNotMatch(
      content,
      /`cloud[^`]+`\s*\./u,
      `${entry.file} 不能绑定具体 CloudBase 环境数据库名`
    )
    assert.doesNotMatch(
      content,
      /\b(?:TIMESTAMP|DATETIME)\b/iu,
      `${entry.file} 时间统一使用 UTC 毫秒`
    )
    sql += `\n${content}`
  }

  const requiredTables = [
    'users',
    'platform_identities',
    'user_sessions',
    'service_replay_nonces',
    'plant_taxa',
    'plant_taxon_names',
    'plant_taxon_relations',
    'plant_identities',
    'plant_identity_aliases',
    'plant_identity_evidence',
    'plant_identity_reviews',
    'plant_identity_candidates',
    'plant_encyclopedia_revisions',
    'plant_knowledge_releases',
    'knowledge_gap_aggregates',
    'knowledge_enrichment_jobs',
    'cms_review_items',
    'cms_contribution_reward_decisions',
    'content_releases',
    'active_content_releases',
    'user_plants',
    'user_plant_profiles',
    'user_plant_care_contexts',
    'user_plant_identity_history',
    'user_plant_assets',
    'user_plant_timeline_projection',
    'guest_sessions',
    'guest_plant_cases',
    'guest_claim_commands',
    'guest_case_claims',
    'care_facts',
    'care_proposals',
    'care_plans',
    'reminder_jobs',
    'watering_visual_evidence',
    'weather_snapshots',
    'temporary_care_sessions',
    'temporary_care_results',
    'temporary_watering_visual_evidence',
    'diagnosis_sessions',
    'diagnosis_answers',
    'diagnosis_results',
    'diagnosis_visual_evidence',
    'temporary_diagnosis_sessions',
    'temporary_diagnosis_answers',
    'temporary_diagnosis_results',
    'temporary_diagnosis_visual_evidence',
    'trial_entitlements',
    'subscriptions',
    'subscription_periods',
    'payment_orders',
    'payment_callback_inbox',
    'care_point_ledger',
    'care_point_accounts',
    'care_level_grants',
    'care_redemptions',
    'business_policy_releases',
    'active_business_policy_releases',
    'provider_config_releases',
    'active_provider_config_releases',
    'configuration_request_snapshots',
    'configuration_release_audit_records',
    'ai_provider_tariff_snapshots',
    'ai_cost_policies',
    'ai_cost_policy_actions',
    'ai_quota_grants',
    'ai_quota_accounts',
    'ai_quota_ledger',
    'ai_quota_reservations',
    'ai_quota_reservation_allocations',
    'subscription_reward_inbox',
    'identity_outbox',
    'plant_knowledge_outbox',
    'user_plant_outbox',
    'care_outbox',
    'diagnosis_outbox',
    'subscription_outbox',
    'security_audit_records'
  ]

  const createdTables = [...sql.matchAll(/CREATE TABLE `([a-z0-9_]+)`/gu)].map(match => match[1])
  assert.deepEqual(new Set(createdTables).size, createdTables.length, '总 DDL 不得重复创建同名表')
  for (const table of requiredTables) {
    assert.ok(createdTables.includes(table), `总 DDL 缺少表：${table}`)
  }

  for (const block of sql.matchAll(/CREATE TABLE `([a-z0-9_]+)` \(([\s\S]*?)\) ENGINE=InnoDB/gu)) {
    const tableName = block[1]
    const body = block[2]
    assert.ok(tableName && body, 'DDL 表定义解析失败')
    assert.match(
      body,
      /`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '[^']+'/u,
      `${tableName} 缺少中文注释内部主键`
    )
    assert.match(
      body,
      /`_openid` VARCHAR\(64\) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属'/u,
      `${tableName} 缺少受控 _openid`
    )
    assert.doesNotMatch(
      body,
      /(?:KEY|UNIQUE KEY)[^\n]*`_openid`/u,
      `${tableName} 禁止用 _openid 建业务归属索引`
    )
  }

  for (const forbidden of [
    'wechat_openid',
    'douyin_openid',
    'xiaohongshu_openid',
    'principal_openid'
  ]) {
    assert.ok(!sql.includes(forbidden), `v2 DDL 禁止平台身份字段扩散：${forbidden}`)
  }
  for (const requiredRule of [
    'UNIQUE KEY `uq_platform_subject` (`platform`, `app_scope`, `platform_subject_hash`)',
    'UNIQUE KEY `uq_guest_case_claim_once` (`guest_plant_case_internal_id`)',
    'UNIQUE KEY `uq_reservation_idempotency` (`user_internal_id`, `product_action_id`, `idempotency_key`)',
    'UNIQUE KEY `uq_reward_event` (`event_id`)',
    'UNIQUE KEY `uq_allocation_pair` (`reservation_internal_id`, `grant_internal_id`)'
  ]) {
    assert.ok(sql.includes(requiredRule), `总 DDL 缺少关键唯一约束：${requiredRule}`)
  }

  for (const requiredCostField of [
    '`tariff_snapshot_sha256` CHAR(64) NOT NULL',
    '`safety_factor_basis_points` INT UNSIGNED NOT NULL',
    '`max_cost_micros` BIGINT UNSIGNED NOT NULL',
    '`estimated_amount` INT UNSIGNED NOT NULL',
    '`actual_cost_micros` BIGINT UNSIGNED NULL',
    '`usage_evidence_ref` VARCHAR(128) NULL',
    '`platform_absorbed_cost_micros` BIGINT UNSIGNED NOT NULL DEFAULT 0'
  ]) {
    assert.ok(sql.includes(requiredCostField), `总 DDL 缺少 AI 成本审计字段：${requiredCostField}`)
  }

  // Expected：configuration-provider-architecture/v1；发布制品、active 指针和请求级快照必须可审计且不可变。
  for (const requiredConfigurationField of [
    '`content_sha256` CHAR(64) NOT NULL',
    '`configuration_sha256` CHAR(64) NOT NULL',
    '`active_release_version` VARCHAR(64) NOT NULL',
    '`snapshot_manifest_json` JSON NOT NULL',
    '`policy_snapshot_sha256` CHAR(64) NOT NULL',
    '`provider_snapshot_sha256` CHAR(64) NOT NULL'
  ]) {
    assert.ok(
      sql.includes(requiredConfigurationField),
      `总 DDL 缺少配置治理字段：${requiredConfigurationField}`
    )
  }

  // Expected 来源：principal-capability/v1 规定快照的策略版本必须可回放，
  // configuration-provider-architecture/v1 规定策略发布须有不可变引用和内容 SHA-256。
  // 同一个快照必须锁定一条真实策略发布，不能只留下无法核验的版本字符串。
  const capabilitySnapshotDefinition = sql.match(
    /CREATE TABLE `capability_snapshots` \(([\s\S]*?)\) ENGINE=InnoDB/iu
  )?.[FIRST_CAPTURE_INDEX]
  const businessPolicyReleaseDefinition = sql.match(
    /CREATE TABLE `business_policy_releases` \(([\s\S]*?)\) ENGINE=InnoDB/iu
  )?.[FIRST_CAPTURE_INDEX]
  assert.ok(capabilitySnapshotDefinition, '缺少 capability_snapshots 表定义')
  assert.ok(businessPolicyReleaseDefinition, '缺少 business_policy_releases 表定义')
  assert.doesNotMatch(
    capabilitySnapshotDefinition,
    /`policy_version`/u,
    '能力快照不得只保存无从核验的 policy_version'
  )
  for (const requiredCapabilityPolicyField of [
    '`capability_policy_release_internal_id` BIGINT UNSIGNED NOT NULL',
    '`capability_policy_domain_code` VARCHAR(40) NOT NULL',
    '`capability_policy_code` VARCHAR(80) NOT NULL',
    '`capability_policy_release_ref` VARCHAR(64) NOT NULL',
    '`capability_policy_release_version` VARCHAR(64) NOT NULL',
    '`capability_policy_content_sha256` CHAR(64) NOT NULL'
  ]) {
    assert.ok(
      capabilitySnapshotDefinition.includes(requiredCapabilityPolicyField),
      `能力快照缺少可回放策略字段：${requiredCapabilityPolicyField}`
    )
  }
  assert.match(
    businessPolicyReleaseDefinition,
    /UNIQUE KEY `uq_business_policy_replay_identity` \(`id`, `domain_code`, `policy_code`, `release_ref`, `release_version`, `content_sha256`\)/u,
    '策略发布必须提供复合唯一身份以供快照外键回放'
  )
  assert.match(
    capabilitySnapshotDefinition,
    /CONSTRAINT `fk_capability_snapshot_policy_release` FOREIGN KEY \(`capability_policy_release_internal_id`, `capability_policy_domain_code`, `capability_policy_code`, `capability_policy_release_ref`, `capability_policy_release_version`, `capability_policy_content_sha256`\) REFERENCES `business_policy_releases` \(`id`, `domain_code`, `policy_code`, `release_ref`, `release_version`, `content_sha256`\)/u,
    '能力快照必须以发布键、引用、版本和内容 SHA-256 关联不可变策略发布'
  )
  assert.match(
    capabilitySnapshotDefinition,
    /CONSTRAINT `ck_capability_snapshot_policy_kind` CHECK \(`capability_policy_domain_code` = 'subscription' AND `capability_policy_code` = 'capability_catalog'\)/u,
    '能力快照只能引用 subscription/capability_catalog 类型化策略'
  )

  const fileOrder = manifest.files.map((entry: { file: string }) => entry.file)
  assert.ok(
    fileOrder.indexOf('007_configuration.sql') < fileOrder.indexOf('005_subscription.sql'),
    '配置策略发布必须先于引用它的 capability_snapshots 创建，空库建表才可建立真实外键'
  )

  for (const forbiddenSecretField of [
    'access_key',
    'secret_key',
    'api_key',
    'private_key',
    'client_secret'
  ]) {
    assert.ok(
      !sql.includes(`\`${forbiddenSecretField}\``),
      `配置 DDL 禁止保存密钥字段：${forbiddenSecretField}`
    )
  }

  assert.ok(sql.includes("COMMENT='青花植 v2"), '每张表必须有中文表注释')
})
