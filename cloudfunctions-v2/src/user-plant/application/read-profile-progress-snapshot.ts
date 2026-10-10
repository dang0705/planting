import type { ProfileProgressPolicy } from '../../configuration/profile-progress-policy.js'

/** 同一请求锁定的完整度快照：规则正文 + 当时浇水策略的 Lux 有效天数。 */
export interface ProfileProgressSnapshot {
  /** 已校验的计分规则。 */ readonly policy: Readonly<ProfileProgressPolicy>
  /** Lux 有效天数（来自 care/mvp_watering 活动发布 luxAnchorMaxAgeDays）。 */ readonly plantLightMaxAgeDays: number
}

/** 快照组装依赖：两份发布各自的只读端口（由入口组装，user-plant 不直接依赖 care 实现）。 */
export interface ReadProfileProgressSnapshotDependencies {
  /** 读取 user-plant/profile_progress 活动发布；不可用返回 null。 */
  readonly readProgressPolicy: (nowMs: number) => Promise<Readonly<ProfileProgressPolicy> | null>
  /** 读取浇水策略的 luxAnchorMaxAgeDays；不可用返回 null。 */
  readonly readPlantLightMaxAgeDays: (nowMs: number) => Promise<number | null>
}

/**
 * 组装完整度快照：两份发布都可用且 Lux 天数为正有限数才返回；任一不可用返回 null（调用方省略完整度字段）。
 * 读取异常向上抛，由装饰层统一吞掉，保证详情页不因进度条失败。
 */
export function createReadProfileProgressSnapshot(dependencies: ReadProfileProgressSnapshotDependencies) {
  return async (nowMs: number): Promise<ProfileProgressSnapshot | null> => {
    const [policy, plantLightMaxAgeDays] = await Promise.all([dependencies.readProgressPolicy(nowMs), dependencies.readPlantLightMaxAgeDays(nowMs)])
    if (policy === null || plantLightMaxAgeDays === null || !Number.isFinite(plantLightMaxAgeDays) || plantLightMaxAgeDays <= 0) { return null }
    return Object.freeze({ policy, plantLightMaxAgeDays })
  }
}
