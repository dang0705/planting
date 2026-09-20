import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, test } from 'vitest'

import type {
  EventRef,
  RewardableDomainEventDto,
  UserPlantRef,
  UserRef
} from '../../src/contracts/types.js'
import {
  创建待投递奖励事件记录,
  奖励事件合同错误
} from '../../src/foundation/outbox/reward-outbox.js'
import { findProjectRoot } from '../support/project-root.js'

/** 测试使用的固定 SHA-256；表示已由生产域按冻结规范计算的载荷摘要。 */
const 测试载荷摘要 = 'a'.repeat(Number('64'))

/** 用于验证 points 字段会被拒绝的任意非零测试值。 */
const 测试积分值 = Number('100')

/** 用于验证数据库内部主键字段会被拒绝的任意正整数。 */
const 测试内部主键 = Number('42')

/** 正则匹配结果中首个捕获组的固定索引。 */
const 首个捕获组索引 = Number('1')

/** 构造一条合同有效的用户植物完整档案事件，测试只覆盖 Foundation 的机械约束。 */
function 创建用户植物奖励事件(): RewardableDomainEventDto {
  return {
    eventId: 'evt_reward_outbox_0001' as EventRef,
    eventType: 'user_plant.profile_completed.v1',
    eventVersion: 1,
    producerDomain: 'user-plant',
    userRef: 'usr_reward_outbox_0001' as UserRef,
    userPlantRef: 'upl_reward_outbox_0001' as UserPlantRef,
    aggregateRef: 'upl_reward_outbox_0001',
    occurrenceRef: 'profile_completed_0001',
    policyVersion: 'care-points/2026-09-20',
    occurredAt: '2026-09-20T12:00:00.000Z',
    payload: { profileCompleted: true },
    payloadHash: 测试载荷摘要
  }
}

/**
 * Expected 来源：`reward-events/v1` 与 P2 Foundation ticket。
 * 测试层次：L1 / `unit_fake`；直接执行领域到 outbox 的机械映射，不替换被测逻辑。
 * 明确未覆盖：真实 Repository、MySQL 事务、dispatcher、重试、租约和 subscription inbox。
 */
describe('奖励事件 outbox 机械合同', () => {
  test('合法事件保持生产者生成的事件引用和载荷，只进入待投递状态', () => {
    const 事件 = 创建用户植物奖励事件()

    expect(创建待投递奖励事件记录('user-plant', 事件)).toEqual({
      producerDomain: 'user-plant',
      event: 事件,
      status: 'pending'
    })
  })

  test.each([
    ['user-plant', 'user_plant.profile_completed.v1'],
    ['care', 'care.soil_check_completed.v1'],
    ['care', 'care.fertilizing_check_completed.v1'],
    ['diagnosis', 'diagnosis.fixed_package_completed.v1'],
    ['plant-knowledge', 'knowledge.contribution_released.v1']
  ] as const)('接受生产域 %s 对应的已登记事件类型 %s', (producerDomain, eventType) => {
    const 事件: RewardableDomainEventDto = {
      ...创建用户植物奖励事件(),
      producerDomain,
      eventType
    }
    if (producerDomain === 'plant-knowledge') {
      delete 事件.userPlantRef
    }

    expect(创建待投递奖励事件记录(producerDomain, 事件).event.eventType).toBe(eventType)
  })

  test.each([
    ['user-plant', 'care.soil_check_completed.v1'],
    ['care', 'diagnosis.fixed_package_completed.v1'],
    ['diagnosis', 'knowledge.contribution_released.v1'],
    ['plant-knowledge', 'user_plant.profile_completed.v1']
  ] as const)('拒绝生产域 %s 与事件类型 %s 错配', (producerDomain, eventType) => {
    const 事件 = {
      ...创建用户植物奖励事件(),
      producerDomain,
      eventType
    } as RewardableDomainEventDto

    expect(() => 创建待投递奖励事件记录(producerDomain, 事件)).toThrow(奖励事件合同错误)
  })

  test('拒绝调用方把其他生产域的事件写入当前域 outbox', () => {
    const 事件 = 创建用户植物奖励事件()

    expect(() => 创建待投递奖励事件记录('care', 事件)).toThrow('生产域不一致')
  })

  test('除知识贡献外的奖励事件必须绑定用户植物', () => {
    const { userPlantRef: _省略用户植物, ...无用户植物事件 } = 创建用户植物奖励事件()

    expect(() =>
      创建待投递奖励事件记录('user-plant', 无用户植物事件 as RewardableDomainEventDto)
    ).toThrow('必须携带用户植物公开引用')
  })

  test('知识贡献事件允许不绑定用户植物', () => {
    const 知识事件: RewardableDomainEventDto = {
      ...创建用户植物奖励事件(),
      eventType: 'knowledge.contribution_released.v1',
      producerDomain: 'plant-knowledge',
      aggregateRef: 'identity_reward_topic_0001',
      occurrenceRef: 'release_occurrence_0001'
    }
    delete 知识事件.userPlantRef

    expect(创建待投递奖励事件记录('plant-knowledge', 知识事件).status).toBe('pending')
  })

  test.each([
    ['points', 测试积分值],
    ['credential', 'secret-value'],
    ['prompt', 'provider-private-prompt'],
    ['traceId', 'trace-private'],
    ['databaseInternalId', 测试内部主键],
    ['privateObjectPath', 'cloud://private/image.jpg'],
    ['modelRawOutput', { hidden: true }]
  ])('拒绝奖励事件载荷中的敏感或奖励结果字段 %s', (field, value) => {
    const 事件 = 创建用户植物奖励事件()
    事件.payload = { safeFact: true, nested: { [field]: value } }

    expect(() => 创建待投递奖励事件记录('user-plant', 事件)).toThrow('载荷包含禁止字段')
  })
})

/**
 * Expected 来源：`reward-events/v1`、数据字典和 P2 Foundation ticket。
 * 测试层次：`unit_real_data`；回读真实 DDL 与 manifest 原始字节，但不连接数据库。
 * 明确未覆盖：MySQL 8.4 CHECK/唯一键实际执行、事务回滚、并发和 CloudBase 兼容性。
 */
describe('四个奖励生产域 outbox DDL 合同', () => {
  test('奖励事件信封可无损持久化且状态组合受数据库约束', () => {
    const 项目根目录 = findProjectRoot()
    const schemaRoot = path.join(项目根目录, 'docs/backend-v2/schema')
    const manifest = JSON.parse(fs.readFileSync(path.join(schemaRoot, 'manifest.json'), 'utf8'))
    const entry = manifest.files.find(
      (item: { file: string }) => item.file === '006_reliable_events.sql'
    )
    expect(entry).toBeDefined()

    const ddl = fs.readFileSync(path.join(schemaRoot, entry.file), 'utf8')
    expect(createHash('sha256').update(ddl).digest('hex')).toBe(entry.sha256)

    const 奖励生产域 = [
      ['plant_knowledge_outbox', 'plant-knowledge'],
      ['user_plant_outbox', 'user-plant'],
      ['care_outbox', 'care'],
      ['diagnosis_outbox', 'diagnosis']
    ] as const

    for (const [tableName, producerDomain] of 奖励生产域) {
      const tableBody = ddl.match(
        new RegExp(`CREATE TABLE \`${tableName}\` \\(([\\s\\S]*?)\\) ENGINE=InnoDB`, 'u')
      )?.[首个捕获组索引]
      expect(tableBody, `${tableName} 缺少表定义`).toBeDefined()

      for (const requiredColumn of [
        '`event_version` TINYINT UNSIGNED NOT NULL',
        '`producer_domain` VARCHAR(32) NOT NULL',
        '`user_ref` VARCHAR(64) NOT NULL',
        '`user_plant_ref` VARCHAR(64) NULL',
        '`occurrence_ref` VARCHAR(100) NOT NULL',
        '`policy_version` VARCHAR(100) NOT NULL',
        '`next_attempt_at_ms` BIGINT UNSIGNED NULL'
      ]) {
        expect(tableBody).toContain(requiredColumn)
      }

      expect(tableBody).toContain(`CHECK (\`producer_domain\` = '${producerDomain}')`)
      expect(tableBody).toContain('CHECK (`event_version` = 1)')
      expect(tableBody).toMatch(/UNIQUE KEY `[^`]+` \(`producer_domain`, `event_id`\)/u)
      expect(tableBody).not.toMatch(
        /UNIQUE KEY `[^`]+` \(`aggregate_ref`, `aggregate_version`, `event_type`\)/u
      )
      expect(tableBody).toContain(
        "`status` IN ('pending', 'dispatching', 'delivered', 'dead_letter')"
      )
      expect(tableBody).toContain(
        "`status` = 'dispatching' AND `lease_owner` IS NOT NULL AND `lease_until_ms` IS NOT NULL"
      )
      expect(tableBody).toContain(
        "`status` = 'delivered' AND `delivered_at_ms` IS NOT NULL AND `lease_owner` IS NULL AND `lease_until_ms` IS NULL"
      )
    }
  })
})
