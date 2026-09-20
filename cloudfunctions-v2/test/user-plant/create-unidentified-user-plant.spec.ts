import { describe, expect, test } from 'vitest'

import type {
  CapabilitySnapshotDto,
  GuestSessionRef,
  PrincipalDto,
  UserCapabilitySnapshotDto,
  UserPlantRef,
  UserRef,
  UserPrincipalDto
} from '../../src/contracts/types.js'
import {
  创建暂未识别用户植物,
  用户植物创建错误
} from '../../src/user-plant/domain/create-unidentified-user-plant.js'

const 当前时间毫秒 = Date.parse('2026-09-20T04:00:00.000Z')
const 初始版本 = 1
const 当前用户引用 = 'usr_01K5WPJ9KCEQJH5H3A1S9NZB7C' as UserRef
const 其他用户引用 = 'usr_01K5WPJ9KCEQJH5H3A1S9NZB7D' as UserRef
const 新用户植物引用 = 'upl_01K5WPJ9KCEQJH5H3A1S9NZB7C' as UserPlantRef
const 游客会话引用 = 'gst_01K5WPJ9KCEQJH5H3A1S9NZB7C' as GuestSessionRef

/** 创建一个未过期、允许创建用户植物的登录主体。 */
function 创建登录主体(): UserPrincipalDto {
  return {
    principalType: 'user',
    user_id: 当前用户引用,
    sessionVersion: 1,
    authenticatedVia: 'wechat',
    issuedAt: '2026-09-20T03:00:00.000Z',
    expiresAt: '2026-09-21T03:00:00.000Z'
  }
}

/** 创建与登录主体匹配的只读能力快照。 */
function 创建用户能力快照(
  覆盖: Partial<UserCapabilitySnapshotDto> = {}
): UserCapabilitySnapshotDto {
  return {
    contractVersion: 'capability-snapshot/v1',
    snapshotRef: 'cps_01K5WPJ9KCEQJH5H3A1S9NZB7C',
    subjectType: 'user',
    user_id: 当前用户引用,
    tier: 'free',
    allowedCapabilities: ['USER_PLANT_CREATE'],
    rewardedAiScopes: [],
    activeUserPlantLimit: 1,
    generatedAt: '2026-09-20T03:59:00.000Z',
    validUntil: '2026-09-20T04:05:00.000Z',
    policyVersion: 'user-plant-limit/2026-09-20.1',
    ...覆盖
  }
}

/**
 * Expected 来源：`user-plant/v1`、`principal-capability/v1` 与 `state-machines/v1`。
 * 测试层次：L1 / `unit_fake`；领域函数是真实模块，时间、引用和当前数量由测试显式提供。
 * 明确未覆盖：HTTP DTO、幂等持久化、Repository、MySQL 并发、outbox、taxonomy 和时间线。
 */
describe('创建暂未识别的用户植物', () => {
  test('登录用户显式加入花园时创建 active/unidentified/version 1 投影', () => {
    const 结果 = 创建暂未识别用户植物({
      principal: 创建登录主体(),
      capabilitySnapshot: 创建用户能力快照(),
      currentActiveCount: 0,
      newUserPlantRef: 新用户植物引用,
      occurredAtMs: 当前时间毫秒
    })

    expect(结果).toEqual({
      user_plant_id: 'upl_01K5WPJ9KCEQJH5H3A1S9NZB7C',
      lifecycle: 'active',
      identityStatus: 'unidentified',
      version: 初始版本,
      createdAt: '2026-09-20T04:00:00.000Z',
      updatedAt: '2026-09-20T04:00:00.000Z'
    })
    expect(结果).not.toHaveProperty('user_id')
    expect(结果).not.toHaveProperty('confirmedIdentityRef')
  })

  test.each([
    {
      name: '游客主体',
      principal: {
        principalType: 'guest',
        guestSessionRef: 游客会话引用,
        authProvider: 'cloudbase_anonymous',
        issuedAt: '2026-09-20T03:00:00.000Z',
        expiresAt: '2026-09-20T05:00:00.000Z'
      } satisfies PrincipalDto,
      snapshot: 创建用户能力快照()
    },
    {
      name: '能力快照属于其他用户',
      principal: 创建登录主体(),
      snapshot: 创建用户能力快照({ user_id: 其他用户引用 })
    },
    {
      name: '快照未授予创建能力',
      principal: 创建登录主体(),
      snapshot: 创建用户能力快照({ allowedCapabilities: [] })
    }
  ])('$name 时拒绝创建', ({ principal, snapshot }) => {
    expect(() =>
      创建暂未识别用户植物({
        principal,
        capabilitySnapshot: snapshot,
        currentActiveCount: 0,
        newUserPlantRef: 新用户植物引用,
        occurredAtMs: 当前时间毫秒
      })
    ).toThrowError(用户植物创建错误)
  })

  test('能力快照在当前时刻恰好到期时以稳定错误拒绝', () => {
    try {
      创建暂未识别用户植物({
        principal: 创建登录主体(),
        capabilitySnapshot: 创建用户能力快照({ validUntil: '2026-09-20T04:00:00.000Z' }),
        currentActiveCount: 0,
        newUserPlantRef: 新用户植物引用,
        occurredAtMs: 当前时间毫秒
      })
      throw new Error('Expected 创建暂未识别用户植物 to throw')
    } catch (错误: unknown) {
      expect(错误).toBeInstanceOf(用户植物创建错误)
      expect((错误 as 用户植物创建错误).type).toBe('CAPABILITY_SNAPSHOT_EXPIRED')
    }
  })

  test('active 数量达到快照上限时拒绝创建且不删除既有植物', () => {
    expect(() =>
      创建暂未识别用户植物({
        principal: 创建登录主体(),
        capabilitySnapshot: 创建用户能力快照(),
        currentActiveCount: 1,
        newUserPlantRef: 新用户植物引用,
        occurredAtMs: 当前时间毫秒
      })
    ).toThrowError(expect.objectContaining({ type: 'CAPABILITY_DENIED' }))
  })

  test('非有限时间或负数 active 计数按内部输入错误失败关闭', () => {
    for (const invalidInput of [
      { currentActiveCount: -1, occurredAtMs: 当前时间毫秒 },
      { currentActiveCount: 0, occurredAtMs: Number.NaN }
    ]) {
      expect(() =>
        创建暂未识别用户植物({
          principal: 创建登录主体(),
          capabilitySnapshot: 创建用户能力快照() as CapabilitySnapshotDto,
          newUserPlantRef: 新用户植物引用,
          ...invalidInput
        })
      ).toThrowError(expect.objectContaining({ type: 'INTERNAL_INPUT_INVALID' }))
    }
  })
})
