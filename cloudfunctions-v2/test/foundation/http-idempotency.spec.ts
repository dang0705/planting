import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, test } from 'vitest'

import {
  判定HTTP幂等请求,
  type HTTP幂等已存记录
} from '../../src/foundation/idempotency/http-idempotency.js'
import { findProjectRoot } from '../support/project-root.js'

/** SHA-256 十六进制摘要的固定字符数。 */
const SHA256十六进制长度 = Number('64')

/** 公开幂等冲突的固定 HTTP 状态码。 */
const 幂等冲突HTTP状态码 = Number('409')

/**
 * Expected 来源：`docs/backend-v2/contracts/http-api.md` 第 4 节与 P2 共享基础设施 ticket。
 * 测试层次：L1 / `unit_fake`；直接执行幂等协议判定，不替换被测逻辑。
 * 明确未覆盖：真实 MySQL 并发唯一键、轮询等待、HTTP 接线与业务事务。
 */
describe('共享 HTTP 幂等协议判定', () => {
  const 首次公开结果 = {
    status: 201,
    body: { data: { userPlantRef: 'upl_01' } }
  } as const

  test('无历史记录时只允许当前请求尝试占位', () => {
    expect(判定HTTP幂等请求(null, 'a'.repeat(SHA256十六进制长度))).toEqual({
      kind: 'reserve'
    })
  })

  test('同请求摘要已完成时精确重放首次公开结果', () => {
    const 记录: HTTP幂等已存记录 = {
      requestHash: 'a'.repeat(SHA256十六进制长度),
      state: 'completed',
      response: 首次公开结果
    }

    expect(判定HTTP幂等请求(记录, 'a'.repeat(SHA256十六进制长度))).toEqual({
      kind: 'replay',
      response: 首次公开结果
    })
  })

  test('同作用域幂等键对应不同请求摘要时稳定返回 409 冲突', () => {
    const 记录: HTTP幂等已存记录 = {
      requestHash: 'a'.repeat(SHA256十六进制长度),
      state: 'completed',
      response: 首次公开结果
    }

    expect(判定HTTP幂等请求(记录, 'b'.repeat(SHA256十六进制长度))).toEqual({
      kind: 'conflict',
      errorType: 'IDEMPOTENCY_CONFLICT',
      httpStatus: 幂等冲突HTTP状态码
    })
  })

  test('同参请求仍在处理时等待唯一获胜者，不重复执行领域命令', () => {
    const 记录: HTTP幂等已存记录 = {
      requestHash: 'a'.repeat(SHA256十六进制长度),
      state: 'processing'
    }

    expect(判定HTTP幂等请求(记录, 'a'.repeat(SHA256十六进制长度))).toEqual({
      kind: 'wait_for_winner'
    })
  })
})

/**
 * Expected 来源：P2 共享基础设施 ticket、HTTP 幂等合同与已冻结的 168 小时保留策略。
 * 测试层次：`unit_real_data`；回读仓库真实 DDL 和 manifest 原始字节。
 * 明确未覆盖：CloudBase MySQL 的实际 CHECK/唯一键行为、清理任务和运行时策略发布。
 */
describe('共享 HTTP 幂等持久化合同', () => {
  test('使用 foundation 独立表和最小安全作用域，不复用 nonce 或业务表', () => {
    const 项目根目录 = findProjectRoot()
    const schemaRoot = path.join(项目根目录, 'docs/backend-v2/schema')
    const manifest = JSON.parse(fs.readFileSync(path.join(schemaRoot, 'manifest.json'), 'utf8'))
    const foundationEntry = manifest.files.find(
      (entry: { owner: string }) => entry.owner === 'shared-infrastructure'
    )

    expect(foundationEntry).toMatchObject({ file: '008_foundation.sql' })
    const ddlPath = path.join(schemaRoot, foundationEntry.file)
    const ddl = fs.readFileSync(ddlPath, 'utf8')

    expect(createHash('sha256').update(ddl).digest('hex')).toBe(foundationEntry.sha256)
    expect(ddl).toContain('CREATE TABLE `http_idempotency_records`')
    for (const requiredColumn of [
      '`principal_type` VARCHAR(16) NOT NULL',
      '`principal_scope_hash` CHAR(64) NOT NULL',
      '`http_method` VARCHAR(8) NOT NULL',
      '`normalized_path` VARCHAR(191) NOT NULL',
      '`operation_id` VARCHAR(96) NOT NULL',
      '`idempotency_key_hash` CHAR(64) NOT NULL',
      '`request_hash` CHAR(64) NOT NULL',
      '`state` VARCHAR(16) NOT NULL',
      '`response_status` SMALLINT UNSIGNED NULL',
      '`response_json` JSON NULL',
      '`response_hash` CHAR(64) NULL',
      '`stable_error_type` VARCHAR(64) NULL',
      '`expires_at_ms` BIGINT UNSIGNED NOT NULL',
      '`completed_at_ms` BIGINT UNSIGNED NULL'
    ]) {
      expect(ddl).toContain(requiredColumn)
    }

    expect(ddl).toContain(
      'UNIQUE KEY `uq_http_idempotency_scope` (`principal_type`, `principal_scope_hash`, `http_method`, `normalized_path`, `operation_id`, `idempotency_key_hash`)'
    )
    expect(ddl).toContain('KEY `idx_http_idempotency_expiry` (`expires_at_ms`)')
    expect(ddl).toContain(
      "CONSTRAINT `ck_http_idempotency_state` CHECK (`state` IN ('processing', 'completed'))"
    )
    expect(ddl).toContain(
      "`state` = 'completed' AND `response_status` IS NOT NULL AND `response_json` IS NOT NULL AND `response_hash` IS NOT NULL AND `completed_at_ms` IS NOT NULL"
    )
    expect(ddl).not.toContain('`idempotency_key`')
    expect(ddl).not.toMatch(/wechat_openid|douyin_openid|xiaohongshu_openid/iu)
    expect(ddl).not.toMatch(/access_token|authorization|cookie/iu)
  })
})
