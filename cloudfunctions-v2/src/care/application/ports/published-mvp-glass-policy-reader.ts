import type { MvpGlassPolicySnapshot } from '../../../configuration/mvp-glass-policy.js'

/** 活动玻璃策略读取结果，只供受控内部用例，不返回HTTP。 */
export type PublishedMvpGlassResolution =
  | {
      /** 活动发布通过结构、指针及摘要核验。 */
      status: 'available'
      /** 权威数据库中的高熵发布引用。 */
      releaseRef: string
      /** 与数据库正文摘要一致的只读策略快照。 */
      snapshot: Readonly<MvpGlassPolicySnapshot>
    }
  | {
      /** 缺少策略、不可信元数据或尚未生效。 */
      status: 'unavailable' | 'invalid' | 'not_effective'
    }

/** 应用只依赖发布读取能力，不认识SQL或数据库连接。 */
export interface PublishedMvpGlassPolicyReader {
  /** 按一次请求捕获的时刻读取并锁定活动版本，数据库错误向调用方传播。 */
  readonly read: (capturedAt: string) => Promise<PublishedMvpGlassResolution>
}
