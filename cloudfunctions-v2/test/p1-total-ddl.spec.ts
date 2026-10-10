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
  assert.ok(manifest.files.some((entry: { file: string }) => entry.file === '023_guest_token_sessions.sql'), 'guest-token/v1 要求的 023 迁移必须登记')
  // Expected 来源：主代理 2026-10-09 裁决 A3——Tropicals 浇水基线表按 v2 惯例纳入 024 迁移。
  assert.ok(manifest.files.some((entry: { file: string }) => entry.file === '024_watering_baseline_policy.sql'), '浇水基线 024 迁移必须登记')

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
    const isSessionPolicyExtension = entry.file === '015_identity_session_policy_snapshot.sql'
    // 批准的 017 专门迁移 Care v2 类型与临时案例归属；不向其他迁移开放 ALTER。
    const isCareV2Extension = entry.file === '017_care_v2_ephemeral_and_derivations.sql'
    // 本轮批准的019只补两类诊断会话的题包快照；不开放其他结构变更。
    const isDiagnosisSnapshotExtension =
      entry.file === '019_diagnosis_question_package_snapshots.sql'
    // 022只补结果回放字段和不可变门，不放开其他迁移的ALTER权限。
    const isDiagnosisResultExtension = entry.file === '022_diagnosis_result_records.sql'
    // Expected 来源：guest-token/v1（用户 2026-10-08 冻结）——游客改为服务端自发令牌，
    // 023 只允许扩展 guest_sessions：新增来源与防刷列、把 CloudBase 匿名摘要改为可空。
    const isGuestTokenExtension = entry.file === '023_guest_token_sessions.sql'
    // Expected 来源：long-term-care/v1 §12.7（用户 2026-10-09 裁决计划过期定时扫描）——028 只允许为 care_plans 新增一个扫描二级索引。
    const isCarePlanExpiryIndex = entry.file === '028_care_plan_expiry_scan_index.sql'
    // Expected 来源：user-plant-timeline.md §5（用户 2026-10-10 裁决时间线异步派发）——029 只允许替换 care_outbox 的事件类型检查约束。
    const isCareOutboxTimelineTypes = entry.file === '029_care_outbox_timeline_event_types.sql'
    if (isCareOutboxTimelineTypes) {
      assert.deepEqual([...content.matchAll(/^ALTER TABLE `([^`]+)`/gmu)].map(match => match[1]), ['care_outbox'])
      assert.deepEqual([...content.matchAll(/\bDROP CHECK `([^`]+)`/gu)].map(match => match[1]), ['ck_care_outbox_event_type'])
      assert.match(content, /ADD CONSTRAINT `ck_care_outbox_event_type` CHECK/u)
      assert.doesNotMatch(content, /\b(?:DROP\s+(?:TABLE|COLUMN|DATABASE|INDEX)|RENAME|CHANGE|MODIFY|CREATE TABLE)\b/iu)
    }
    if (isCarePlanExpiryIndex) {
      assert.deepEqual([...content.matchAll(/^CREATE INDEX `([^`]+)` ON `([^`]+)`/gmu)].map(match => [match[1], match[2]]), [['idx_care_plan_expiry_scan', 'care_plans']])
      assert.doesNotMatch(content, /\b(?:DROP|RENAME|CHANGE|MODIFY|ALTER|CREATE TABLE|CREATE TRIGGER)\b/iu)
    }
    if (isGuestTokenExtension) {
      assert.deepEqual([...content.matchAll(/^ALTER TABLE `([^`]+)`/gmu)].map(match => match[1]), ['guest_sessions'])
      assert.deepEqual([...content.matchAll(/ADD COLUMN `([^`]+)`/gu)].map(match => match[1]), ['identity_source', 'issuance_source_hash'])
      assert.deepEqual([...content.matchAll(/MODIFY COLUMN `([^`]+)`/gu)].map(match => match[1]), ['anonymous_subject_hash'])
      assert.match(content, /MODIFY COLUMN `anonymous_subject_hash` CHAR\(64\) NULL/u)
      assert.match(content, /ADD CONSTRAINT `ck_guest_session_identity_source` CHECK \(`identity_source` IN \('cloudbase_anonymous', 'server_issued_guest_token'\)\)/u)
      assert.match(content, /ADD KEY `idx_guest_session_issuance` \(`issuance_source_hash`, `issued_at_ms`\)/u)
      // 每次业务请求按令牌摘要定位会话，摘要来自 256 位随机令牌，必须唯一且有索引。
      assert.match(content, /ADD UNIQUE KEY `uq_guest_session_proof` \(`possession_proof_hash`\)/u)
      assert.doesNotMatch(content, /\b(?:DROP|RENAME|CHANGE|CREATE TABLE)\b/iu)
    }
    if (isDiagnosisResultExtension) {
      assert.deepEqual(
        [...content.matchAll(/^ALTER TABLE `([^`]+)`/gmu)].map(match => match[1]),
        ['diagnosis_results']
      )
      assert.deepEqual(
        [...content.matchAll(/ADD COLUMN `([^`]+)`/gu)].map(match => match[1]),
        [
          'record_schema_version',
          'public_result_json',
          'replay_snapshot_json',
          'record_sha256',
          'knowledge_release_ref'
        ]
      )
      assert.doesNotMatch(content, /\b(?:DROP|RENAME|MODIFY|CHANGE|CREATE TABLE)\b/iu)
      for (const name of [
        'tr_diag_result_record_insert',
        'tr_diag_result_record_update',
        'tr_diag_result_record_delete'
      ]) {
        assert.ok(content.includes('CREATE TRIGGER `' + name + '`'))
      }
      assert.match(content, /REFERENCES `diagnosis_knowledge_releases` \(`release_ref`\)/u)
    }
    if (isDiagnosisSnapshotExtension) {
      assert.deepEqual(
        [...content.matchAll(/^ALTER TABLE `([^`]+)`/gmu)].map(match => match[1]),
        ['diagnosis_sessions', 'temporary_diagnosis_sessions']
      )
      assert.deepEqual(
        [...content.matchAll(/ADD COLUMN `([^`]+)`/gu)].map(match => match[1]),
        [
          'question_package_snapshot_json',
          'question_package_snapshot_sha256',
          'question_package_snapshot_json',
          'question_package_snapshot_sha256'
        ]
      )
      assert.doesNotMatch(content, /\b(?:DROP|RENAME|MODIFY|CHANGE|CREATE TABLE)\b/iu)
      for (const name of [
        'tr_diagnosis_package_snapshot_insert',
        'tr_diagnosis_package_snapshot_update',
        'tr_temporary_diagnosis_package_snapshot_insert',
        'tr_temporary_diagnosis_package_snapshot_update'
      ]) {
        assert.ok(content.includes('CREATE TRIGGER `' + name + '`'))
      }
    }
    if (isCareV2Extension) {
      const alteredTables = [...content.matchAll(/^ALTER TABLE `([^`]+)`/gmu)]
        .map(match => match[1])
        .sort()
      assert.deepEqual(
        alteredTables,
        [
          'care_environment_derivations',
          'temporary_care_results',
          'temporary_care_sessions',
          'temporary_diagnosis_answers',
          'temporary_diagnosis_results',
          'temporary_diagnosis_sessions',
          'temporary_diagnosis_visual_evidence',
          'temporary_watering_visual_evidence'
        ].sort(),
        'Care v2 迁移只允许变更批准的派生与临时案例表'
      )
      assert.doesNotMatch(
        content,
        /\b(?:DROP\s+(?:TABLE|COLUMN|DATABASE|INDEX)|RENAME|CHANGE)\b/iu,
        'Care v2 迁移不得删除数据结构或重命名字段'
      )
      assert.deepEqual(
        [...content.matchAll(/\bDROP CHECK `([^`]+)`/gu)].map(match => match[1]),
        ['ck_environment_derivation_type']
      )
      assert.match(content, /ADD CONSTRAINT `ck_environment_derivation_type` CHECK/u)
      assert.match(content, /CREATE TABLE `care_decision_derivations`/u)
      for (const prefix of [
        'care',
        'care_result',
        'watering',
        'diagnosis',
        'answer',
        'result',
        'visual'
      ]) {
        assert.match(
          content,
          new RegExp('ADD CONSTRAINT `ck_temporary_' + prefix + '_one_ephemeral_case` CHECK \\('),
          '临时案例必须保持两类归属互斥约束'
        )
      }
    }
    if (/CREATE TABLE\b/u.test(content)) {
      assert.ok(content.includes('ENGINE=InnoDB'), `${entry.file} 建表必须固定 InnoDB`)
      assert.ok(content.includes('DEFAULT CHARSET=utf8mb4'), `${entry.file} 建表必须固定 utf8mb4`)
    } else if (isGuestTokenExtension) {
      assert.match(content, /^ALTER TABLE `guest_sessions`\s/mu, '游客令牌迁移只扩展既有游客会话表')
    } else if (isCareOutboxTimelineTypes) {
      assert.match(content, /^ALTER TABLE `care_outbox`\s/mu, '时间线事件迁移只扩展 care 发件箱事件类型')
    } else if (isCarePlanExpiryIndex) {
      assert.match(content, /^CREATE INDEX `idx_care_plan_expiry_scan` ON `care_plans` \(`status`, `scheduled_at_ms`, `id`\);$/mu, '过期扫描迁移只新增既定二级索引')
    } else if (isSessionPolicyExtension) {
      assert.match(content, /^ALTER TABLE `user_sessions`\s/mu, '会话策略迁移只扩展既有会话表')
      assert.match(content, /\bADD COLUMN\b/u, '会话策略迁移必须显式新增字段')
      assert.doesNotMatch(
        content,
        /\b(?:DROP|RENAME|MODIFY|CHANGE)\b/iu,
        '会话策略迁移不得删除或改写既有字段'
      )
    } else {
      assert.match(content, /CREATE TRIGGER\b/u, `${entry.file} 必须是建表或新增门禁触发器`)
    }
    assert.doesNotMatch(
      content,
      isSessionPolicyExtension ||
        isCareV2Extension ||
        isDiagnosisSnapshotExtension ||
        isDiagnosisResultExtension ||
        isGuestTokenExtension ||
        isCareOutboxTimelineTypes
        ? /^(?:DROP|INSERT|UPDATE|DELETE)\b/imu
        : /^(?:DROP|ALTER|INSERT|UPDATE|DELETE)\b/imu,
      `${entry.file} 仅允许经 manifest 顺序化的非破坏性结构变更`
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
    'care_environment_observations',
    'care_environment_snapshots',
    'care_environment_derivations',
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
    'http_idempotency_records',
    'identity_outbox',
    'plant_knowledge_outbox',
    'user_plant_outbox',
    'care_outbox',
    'diagnosis_outbox',
    'subscription_outbox',
    'security_audit_records',
    'watering_baseline_policy',
    // Expected：long-term-care-contract.md §10（主代理 2026-10-09 裁决 T1/T4）。
    'care_capability_results',
    'user_plant_catalog_bindings'
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
    'UNIQUE KEY `uq_allocation_pair` (`reservation_internal_id`, `grant_internal_id`)',
    'UNIQUE KEY `uq_http_idempotency_scope` (`principal_type`, `principal_scope_hash`, `http_method`, `normalized_path`, `operation_id`, `idempotency_key_hash`)'
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
