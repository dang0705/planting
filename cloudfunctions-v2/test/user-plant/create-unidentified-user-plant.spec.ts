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
  createUnidentifiedUserPlant,
  UserPlantCreateError
} from '../../src/user-plant/domain/create-unidentified-user-plant.js'

const currentTimeMillis = Date.parse('2026-09-20T04:00:00.000Z')
const initialVersion = 1
const currentUserRef = 'usr_01K5WPJ9KCEQJH5H3A1S9NZB7C' as UserRef
const otherUserRef = 'usr_01K5WPJ9KCEQJH5H3A1S9NZB7D' as UserRef
const newUserPlantRef = 'upl_01K5WPJ9KCEQJH5H3A1S9NZB7C' as UserPlantRef
const guestSessionRef = 'gst_01K5WPJ9KCEQJH5H3A1S9NZB7C' as GuestSessionRef

/** 创建一个未过期、允许创建用户植物的登录主体。 */
function createLoginPrincipal(): UserPrincipalDto {
  return {
    principalType: 'user',
    user_id: currentUserRef,
    sessionVersion: 1,
    authenticatedVia: 'wechat',
    issuedAt: '2026-09-20T03:00:00.000Z',
    expiresAt: '2026-09-21T03:00:00.000Z'
  }
}

/** 创建与登录主体匹配的只读能力快照。 */
function createUserCapabilitySnapshot(
  overrides: Partial<UserCapabilitySnapshotDto> = {}
): UserCapabilitySnapshotDto {
  return {
    contractVersion: 'capability-snapshot/v1',
    snapshotRef: 'cps_01K5WPJ9KCEQJH5H3A1S9NZB7C',
    subjectType: 'user',
    user_id: currentUserRef,
    tier: 'free',
    allowedCapabilities: ['USER_PLANT_CREATE'],
    rewardedAiScopes: [],
    activeUserPlantLimit: 1,
    generatedAt: '2026-09-20T03:59:00.000Z',
    validUntil: '2026-09-20T04:05:00.000Z',
    policyVersion: 'user-plant-limit/2026-09-20.1',
    ...overrides
  }
}

/**
 * Expected 来源：`user-plant/v1`、`principal-capability/v1` 与 `state-machines/v1`。
 * 测试层次：L1 / `unit_fake`；领域函数是真实模块，时间、引用和当前数量由测试显式提供。
 * 明确未覆盖：HTTP DTO、幂等持久化、Repository、MySQL 并发、outbox、taxonomy 和时间线。
 */
describe('创建暂未识别的用户植物', () => {
  test('登录用户显式加入花园时创建 active/unidentified/version 1 投影', () => {
    const result = createUnidentifiedUserPlant({
      principal: createLoginPrincipal(),
      capabilitySnapshot: createUserCapabilitySnapshot(),
      currentActiveCount: 0,
      newUserPlantRef: newUserPlantRef,
      occurredAtMs: currentTimeMillis
    })

    expect(result).toEqual({
      user_plant_id: 'upl_01K5WPJ9KCEQJH5H3A1S9NZB7C',
      lifecycle: 'active',
      identityStatus: 'unidentified',
      version: initialVersion,
      createdAt: '2026-09-20T04:00:00.000Z',
      updatedAt: '2026-09-20T04:00:00.000Z'
    })
    expect(result).not.toHaveProperty('user_id')
    expect(result).not.toHaveProperty('confirmedIdentityRef')
  })

  test.each([
    {
      name: '游客主体',
      principal: {
        principalType: 'guest',
        guestSessionRef: guestSessionRef,
        authProvider: 'server_issued_guest_token',
        issuedAt: '2026-09-20T03:00:00.000Z',
        expiresAt: '2026-09-20T05:00:00.000Z'
      } satisfies PrincipalDto,
      snapshot: createUserCapabilitySnapshot()
    },
    {
      name: '能力快照属于其他用户',
      principal: createLoginPrincipal(),
      snapshot: createUserCapabilitySnapshot({ user_id: otherUserRef })
    },
    {
      name: '快照未授予创建能力',
      principal: createLoginPrincipal(),
      snapshot: createUserCapabilitySnapshot({ allowedCapabilities: [] })
    }
  ])('$name 时拒绝创建', ({ principal, snapshot }) => {
    expect(() =>
      createUnidentifiedUserPlant({
        principal,
        capabilitySnapshot: snapshot,
        currentActiveCount: 0,
        newUserPlantRef: newUserPlantRef,
        occurredAtMs: currentTimeMillis
      })
    ).toThrowError(UserPlantCreateError)
  })

  test('能力快照在当前时刻恰好到期时以稳定错误拒绝', () => {
    try {
      createUnidentifiedUserPlant({
        principal: createLoginPrincipal(),
        capabilitySnapshot: createUserCapabilitySnapshot({ validUntil: '2026-09-20T04:00:00.000Z' }),
        currentActiveCount: 0,
        newUserPlantRef: newUserPlantRef,
        occurredAtMs: currentTimeMillis
      })
      throw new Error('Expected 创建暂未识别用户植物 to throw')
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(UserPlantCreateError)
      expect((error as UserPlantCreateError).type).toBe('CAPABILITY_SNAPSHOT_EXPIRED')
    }
  })

  test('active 数量达到快照上限时拒绝创建且不删除既有植物', () => {
    expect(() =>
      createUnidentifiedUserPlant({
        principal: createLoginPrincipal(),
        capabilitySnapshot: createUserCapabilitySnapshot(),
        currentActiveCount: 1,
        newUserPlantRef: newUserPlantRef,
        occurredAtMs: currentTimeMillis
      })
    ).toThrowError(expect.objectContaining({ type: 'CAPABILITY_DENIED' }))
  })

  test('非有限时间或负数 active 计数按内部输入错误失败关闭', () => {
    for (const invalidInput of [
      { currentActiveCount: -1, occurredAtMs: currentTimeMillis },
      { currentActiveCount: 0, occurredAtMs: Number.NaN }
    ]) {
      expect(() =>
        createUnidentifiedUserPlant({
          principal: createLoginPrincipal(),
          capabilitySnapshot: createUserCapabilitySnapshot() as CapabilitySnapshotDto,
          newUserPlantRef: newUserPlantRef,
          ...invalidInput
        })
      ).toThrowError(expect.objectContaining({ type: 'INTERNAL_INPUT_INVALID' }))
    }
  })
})
