import type { UserCapabilitySnapshotDto, UserPrincipalDto } from '../../contracts/types.js'
import { CapabilitySnapshotUnavailableError } from '../repository/mysql-capability-snapshot-reader.js'

/** 首次需要能力时使用的订阅域端口；读取与生成都只能接收已认证的统一用户主体。 */
export type OnDemandCapabilitySnapshotDependencies = {
  /** 从订阅域持久化记录读取当前有效的能力快照；缺失或过期时失败关闭。 */
  readonly read: (principal: UserPrincipalDto) => Promise<UserCapabilitySnapshotDto>
  /** 根据可信 Identity 锚点及已发布策略生成并持久化新快照。 */
  readonly generate: (principal: UserPrincipalDto) => Promise<UserCapabilitySnapshotDto>
}

/** 有效快照直接复用；只有缺失或过期时才由订阅域裁决，并从数据库读回写入结果。 */
export function createResolveOnDemandCapabilitySnapshot(
  dependencies: OnDemandCapabilitySnapshotDependencies
): (principal: UserPrincipalDto) => Promise<UserCapabilitySnapshotDto> {
  return async principal => {
    try {
      return await dependencies.read(principal)
    } catch (error: unknown) {
      if (!(error instanceof CapabilitySnapshotUnavailableError)) {
        throw error
      }
    }
    await dependencies.generate(principal)
    return dependencies.read(principal)
  }
}
