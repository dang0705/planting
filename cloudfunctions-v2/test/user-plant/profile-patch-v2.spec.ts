import { describe, expect, test } from 'vitest'

import { hasCompleteMeasuredPot, lockUserPlantProfilePatch } from '../../src/user-plant/domain/profile-patch.js'
import { projectPublicProfile } from '../../src/user-plant/domain/public-profile.js'

/**
 * Expected 来源：`docs/backend-v2/contracts/user-plant-environment-profile.md`（2026-10-10 用户审定）§1 请求与 §3.1 pot 完整判定；
 * 唯一机器事实源 `models/user-plant/profile-patch.v2.schema.json`。v1 行为（昵称/实测盆器）保持由既有 profile-patch.spec.ts 守护。
 * 测试层次：L1 / `unit_fake`（纯函数）。未覆盖：落库与公开读回（见 e2e）。
 */

const pot = { actualInnerPotConfirmed: true, drainageAvailable: true, potTopDiameterCm: 12, potBottomDiameterCm: 9, potHeightCm: 11 }
const environment = {
  substrate: { materials: ['general', 'perlite'], primaryMaterial: 'general' },
  location: { cityRef: 'chongqing', placement: 'indoor' },
  lighting: { windowFacing: 'S' },
  ventilation: { airExchange: 'occasional', localAirflow: 'none', directBlowing: false }
}

describe('profile-patch/v2 环境分组', () => {
  test('四个环境分组与 v1 字段可同时提交，原样冻结', () => {
    const value = lockUserPlantProfilePatch({ version: 3, nickname: '小青', measuredPot: pot, ...environment })
    expect(value).toEqual({ version: 3, nickname: '小青', measuredPot: pot, ...environment })
    expect(Object.isFrozen(value)).toBe(true)
  })

  test.each(['substrate', 'location', 'lighting', 'ventilation'])('%s 显式 null 表示清除，可单独提交', key => {
    expect(lockUserPlantProfilePatch({ version: 1, [key]: null })).toEqual({ version: 1, [key]: null })
  })

  test('分组内未知值显式 null 合法（盆型未知、直吹未知）', () => {
    expect(lockUserPlantProfilePatch({ version: 1, ventilation: { ...environment.ventilation, directBlowing: null } }))
      .toMatchObject({ ventilation: { directBlowing: null } })
  })

  test.each([
    ['光照夹带 source', { lighting: { ...environment.lighting, source: 'user_selected' } }],
    ['位置夹带经纬度', { location: { ...environment.location, latitude: 29.56 } }],
    ['城市引用大写', { location: { cityRef: 'ChongQing', placement: 'indoor' } }],
    ['城市引用过短', { location: { cityRef: 'c', placement: 'indoor' } }],
    ['未知摆放', { location: { cityRef: 'chongqing', placement: 'kitchen' } }],
    // 2026-10-10 用户纠偏：盆型=尺寸（measuredPot），删除 potShape 分组；光照只收朝向，删除玻璃层数/距离/遮挡。
    ['已删除的 potShape 分组', { potShape: { shape: 'round', wallMaterial: 'terracotta' } }],
    ['已删除的 potShape 清除', { potShape: null }],
    ['光照夹带已删除的 glassLayers', { lighting: { windowFacing: 'S', glassLayers: 2 } }],
    ['光照夹带已删除的 distanceBand', { lighting: { windowFacing: 'S', distanceBand: 'within_1m' } }],
    ['光照夹带已删除的 obstruction', { lighting: { windowFacing: 'S', obstruction: 'partial' } }],
    ['朝向小写', { lighting: { ...environment.lighting, windowFacing: 's' } }],
    ['基质为空数组', { substrate: { materials: [], primaryMaterial: null } }],
    ['基质重复', { substrate: { materials: ['coco', 'coco'], primaryMaterial: 'coco' } }],
    ['主要基质不在组分内', { substrate: { materials: ['coco'], primaryMaterial: 'bark' } }],
    ['未知基质', { substrate: { materials: ['soil'], primaryMaterial: null } }],
    ['通风缺字段', { ventilation: { airExchange: 'closed', localAirflow: 'none' } }],
    ['客户端提交 DLI', { lighting: { ...environment.lighting, dli: 12 } }],
    ['客户端提交完整度', { profileCompletedAt: '2026-10-10T00:00:00Z' }],
    ['基质夹带持水倍率', { substrate: { materials: ['coco'], primaryMaterial: 'coco', retentionFactor: 1.2 } }]
  ])('%s → 拒绝', (_name, extra) => {
    expect(() => lockUserPlantProfilePatch({ version: 1, ...extra })).toThrow(TypeError)
  })

  test('v1 语义不变：measuredPot 与 nickname 不接受 null', () => {
    expect(() => lockUserPlantProfilePatch({ version: 1, measuredPot: null })).toThrow(TypeError)
    expect(() => lockUserPlantProfilePatch({ version: 1, nickname: null })).toThrow(TypeError)
  })
})

describe('pot 完整判定（合同 §3.1）', () => {
  test.each([
    [pot, true],
    [{ ...pot, potTopDiameterCm: null, potBottomDiameterCm: null }, true],
    [{ ...pot, actualInnerPotConfirmed: null }, true],
    [{ ...pot, drainageAvailable: false }, true],
    [{ ...pot, drainageAvailable: null }, false],
    [{ ...pot, potTopDiameterCm: null, potBottomDiameterCm: null, potHeightCm: null }, false],
    [undefined, false]
  ] as const)('%j → %s', (value, expected) => {
    expect(hasCompleteMeasuredPot(value)).toBe(expected)
  })
})

describe('已删除字段的库内旧值（2026-10-10 用户纠偏：不做 DDL，只是不再读写/公开）', () => {
  test('旧 potShapeProfile 不再公开；旧光照多余键被忽略，只公开 windowFacing', () => {
    const profile = projectPublicProfile({
      profile_internal_id: '7', profile_nickname: '旧档案', profile_openid: '',
      profile_pot_json: { measuredPot: pot, potShapeProfile: { shape: 'round', wallMaterial: 'terracotta' } },
      context_internal_id: '9', context_location_json: { cityRef: 'chongqing', placement: 'indoor' },
      context_light_json: { windowFacing: 'S', glassLayers: 2, distanceBand: 'within_1m', obstruction: 'partial' }, context_ventilation_json: null
    })
    expect(profile).toEqual({ nickname: '旧档案', measuredPot: pot, location: { cityRef: 'chongqing', placement: 'indoor' }, lighting: { windowFacing: 'S' } })
  })
})
