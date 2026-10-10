import { PublicRequestError } from '../http/request-chain.js'

/** 读取策略快照的服务端口：返回已校验规则，或 null 表示没有可信活动发布。 */
export type PolicyRulesPort<T> = () => Promise<Readonly<T> | null>

/**
 * 在请求链中读取一次策略快照（configuration-layers/v2 §3）：没有可信发布或读取失败时抛 503 SERVICE_UNAVAILABLE，
 * 公开消息泛化、不含 SQL 或策略内容；绝不回退源码默认值。
 */
export async function requirePolicy<T>(read: PolicyRulesPort<T>): Promise<Readonly<T>> {
  let rules: Readonly<T> | null
  try { rules = await read() } catch { rules = null }
  if (rules === null) { throw new PublicRequestError(503, 'SERVICE_UNAVAILABLE', '服务暂时不可用') }
  return rules
}

/** 带发布版本号的策略快照：规则与其不可变发布版本来自同一次读取，供需要在响应中注明策略版本的接口使用。 */
export type PolicySnapshot<T> = {
  /** 已校验、深度冻结的策略正文。 */
  readonly rules: Readonly<T>
  /** 本次锁定的发布版本（如 `plant-knowledge-public-search/v2.0.0`），可公开。 */
  readonly releaseVersion: string
}

/** 读取带版本号策略快照的服务端口；null 表示没有可信活动发布。 */
export type PolicySnapshotPort<T> = () => Promise<PolicySnapshot<T> | null>

/** 与 requirePolicy 同语义：没有可信发布或读取失败抛 503，不回退源码默认值。 */
export async function requirePolicySnapshot<T>(read: PolicySnapshotPort<T>): Promise<PolicySnapshot<T>> {
  let snapshot: PolicySnapshot<T> | null
  try { snapshot = await read() } catch { snapshot = null }
  if (snapshot === null) { throw new PublicRequestError(503, 'SERVICE_UNAVAILABLE', '服务暂时不可用') }
  return snapshot
}
