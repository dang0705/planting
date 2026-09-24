/** 用户植物合同允许的生命周期状态。 */
export type UserPlantLifecycleStatus = 'active' | 'archived' | 'deleting' | 'deleted'

/** 合同状态集合，用于拒绝损坏的数据库值或未经授权的外部字符串。 */
const lifecycleStatuses = ['active', 'archived', 'deleting', 'deleted'] as const

/**
 * 用户植物生命周期状态图的唯一允许边。
 * active 与 archived 可互相恢复；二者均可开始删除；deleting 只能收敛到 deleted。
 */
const allowedTransitions: Readonly<
  Record<UserPlantLifecycleStatus, readonly UserPlantLifecycleStatus[]>
> = {
  active: ['archived', 'deleting'],
  archived: ['active', 'deleting'],
  deleting: ['deleted'],
  deleted: []
}

/** 判断运行时值是否属于冻结的生命周期状态集合。 */
function isLifecycleStatus(value: unknown): value is UserPlantLifecycleStatus {
  return typeof value === 'string' && lifecycleStatuses.some(status => status === value)
}

/**
 * 判断用户植物生命周期转换是否与冻结状态图一致。
 *
 * 此纯领域判断不写数据库、不负责归属与幂等，也不决定公开错误；应用服务应在用户归属校验、
 * Repository 锁定与乐观版本检查后调用，并在同一事务内保存合法转换。
 */
export function canTransitionUserPlantLifecycle(current: unknown, next: unknown): boolean {
  if (!isLifecycleStatus(current) || !isLifecycleStatus(next)) {
    return false
  }

  return allowedTransitions[current].some(status => status === next)
}
