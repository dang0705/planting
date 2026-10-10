import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, test } from 'vitest'

import type { UserPlantDto, UserPlantRef, UserPrincipalDto, UserRef } from '../../src/contracts/types.js'
import type { DatabaseTransactionDriver, TransactionExecutionContext } from '../../src/foundation/database/transaction-runner.js'
import { createListUserPlantsApplicationService } from '../../src/user-plant/application/list-user-plants.js'
import {
  decodeUserPlantListCursor,
  encodeUserPlantListCursor,
  resolveUserPlantListLimit
} from '../../src/user-plant/domain/user-plant-list-query.js'
import type { ListOwnedUserPlantsQuery } from '../../src/user-plant/repository/mysql-user-plant-list-repository.js'
import { userPlantListRulesV1 } from '../support/business-policy-fixtures.js'
import { findProjectRoot } from '../support/project-root.js'

/**
 * Expected 来源：配置目录 `user-plant.list.page_size` = {default:20,max:50}（hard_rule，主代理 2026-10-10 裁定）；
 * `user-plant.md`「列表公开接口」：最后一页 nextCursor 为 null，游标只编码“创建时间 + 公开引用”。
 * 测试层次：L1 / `unit_fake`（纯函数 + 替身 Repository 与事务驱动）。未覆盖：真实 SQL（见 e2e）。
 */

const catalog = JSON.parse(fs.readFileSync(path.join(findProjectRoot(), 'docs/backend-v2/architecture/configuration-variable-catalog.json'), 'utf8')) as {
  variables: Array<{ id: string; currentValue: unknown }>
}

describe('用户植物列表规则', () => {
  // 用户 2026-10-10 第三轮裁定：分页迁入策略发布 user-plant/list_rules（取值不变），解析函数显式接收策略快照。
  const pageSize = userPlantListRulesV1().userPlantListPageSize
  test('策略 v1 分页与配置目录一致', () => {
    expect(pageSize).toEqual(catalog.variables.find(variable => variable.id === 'user-plant.list.page_size')?.currentValue)
  })

  test.each([[null, 20], ['1', 1], ['50', 50], ['51', null], ['0', null], ['05', null], ['-3', null], ['2.0', null], ['', null]] as const)(
    'limit=%s → %s', (raw, expected) => {
      expect(resolveUserPlantListLimit(raw, pageSize)).toBe(expected)
    })

  test('游标往返一致；篡改、非 JSON、负时间、非 upl_ 引用均为 null', () => {
    const cursor = { createdAtMs: 123, userPlantRef: 'upl_cursor_plant_0001' as UserPlantRef }
    const encoded = encodeUserPlantListCursor(cursor)
    expect(decodeUserPlantListCursor(encoded)).toEqual(cursor)
    expect(encoded).not.toMatch(/usr_/u)
    expect(decodeUserPlantListCursor(`${encoded}x`)).toBeNull()
    expect(decodeUserPlantListCursor('not json')).toBeNull()
    expect(decodeUserPlantListCursor(Buffer.from('[-1,"upl_cursor_plant_0001"]').toString('base64url'))).toBeNull()
    expect(decodeUserPlantListCursor(Buffer.from('[1,"usr_cursor_plant_0001"]').toString('base64url'))).toBeNull()
  })
})

describe('列表应用用例', () => {
  const principal: UserPrincipalDto = { principalType: 'user', user_id: 'usr_list_app_owner01' as UserRef, sessionVersion: 1, authenticatedVia: 'wechat', issuedAt: '2026-10-10T00:00:00.000Z', expiresAt: '2026-10-11T00:00:00.000Z' }
  const plantAt = (ms: number, ref: string): UserPlantDto => ({ user_plant_id: ref as UserPlantRef, lifecycle: 'active', identityStatus: 'unidentified', version: 1, createdAt: new Date(ms).toISOString(), updatedAt: new Date(ms).toISOString() })
  const driver: DatabaseTransactionDriver<TransactionExecutionContext> = {
    beginTransaction: async () => ({ transactionContext: true }), commitTransaction: async () => undefined,
    rollbackTransaction: async () => undefined, recordRollbackFailure: async () => undefined
  }
  function serviceReturning(rows: UserPlantDto[]) {
    const queries: ListOwnedUserPlantsQuery[] = []
    const service = createListUserPlantsApplicationService({ driver, repository: { listOwnedUserPlants: async (_tx, query) => { queries.push(query); return rows.slice(0, query.fetchLimit) } } })
    return { service, queries }
  }

  test('多读一行判断下一页：读到 limit+1 行时只返回 limit 行，游标指向本页最后一项', async () => {
    const { service, queries } = serviceReturning([plantAt(3000, 'upl_list_app_plant03'), plantAt(2000, 'upl_list_app_plant02'), plantAt(1000, 'upl_list_app_plant01')])
    const result = await service({ principal, lifecycles: ['active'], limit: 2, after: null })
    const data = (result.body as { data: { items: UserPlantDto[]; nextCursor: string | null } }).data

    expect(queries).toEqual([{ userRef: principal.user_id, lifecycles: ['active'], fetchLimit: 3, after: null }])
    expect(data.items.map(item => item.user_plant_id)).toEqual(['upl_list_app_plant03', 'upl_list_app_plant02'])
    expect(decodeUserPlantListCursor(data.nextCursor!)).toEqual({ createdAtMs: 2000, userPlantRef: 'upl_list_app_plant02' })
  })

  test('不足一页或恰好一页时 nextCursor 为 null；没有植物返回空列表', async () => {
    const exact = serviceReturning([plantAt(2000, 'upl_list_app_plant02'), plantAt(1000, 'upl_list_app_plant01')])
    expect((await exact.service({ principal, lifecycles: ['active'], limit: 2, after: null })).body).toMatchObject({ data: { nextCursor: null } })
    const empty = serviceReturning([])
    expect(await empty.service({ principal, lifecycles: ['active', 'archived'], limit: 20, after: null })).toEqual({ status: 200, body: { data: { items: [], nextCursor: null } } })
  })
})
