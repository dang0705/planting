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
