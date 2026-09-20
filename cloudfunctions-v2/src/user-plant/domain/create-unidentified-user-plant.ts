import type {
  CapabilitySnapshotDto,
  PrincipalDto,
  UserPlantDto,
  UserPlantRef
} from '../../contracts/types.js'

/** 创建用户植物领域规则可以产生的稳定拒绝类型。 */
export type 用户植物创建错误类型 =
  | 'PRINCIPAL_INVALID'
  | 'CAPABILITY_DENIED'
  | 'CAPABILITY_SNAPSHOT_EXPIRED'
  | 'INTERNAL_INPUT_INVALID'

/** 领域拒绝由应用层转换为公共 HTTP 错误；异常中不携带内部主键或凭证。 */
export class 用户植物创建错误 extends Error {
  /** 稳定拒绝类型；`INTERNAL_INPUT_INVALID` 只能映射为泛化内部错误。 */
  readonly type: 用户植物创建错误类型

  constructor(type: 用户植物创建错误类型, message: string) {
    super(message)
    this.name = '用户植物创建错误'
    this.type = type
  }
}

/** 创建一株暂未识别用户植物所需的纯领域输入。 */
export type 创建暂未识别用户植物输入 = {
  /** 已由 identity 域解析的访问主体；只有登录用户允许创建长期用户植物。 */
  principal: PrincipalDto
  /** subscription 域生成的请求级只读能力快照；领域层不能自行猜测植物数量上限。 */
  capabilitySnapshot: CapabilitySnapshotDto
  /** Repository 在同一受控事务内读取的当前 active 用户植物数量。 */
  currentActiveCount: number
  /** 服务端生成的高熵用户植物公开引用；不能来自客户端，也不是数据库内部主键。 */
  newUserPlantRef: UserPlantRef
  /** 服务端时钟提供的业务发生时间，使用 Unix epoch 毫秒。 */
  occurredAtMs: number
}

const 初始版本 = 1
const 最小Active数量 = 0
const 用户植物公开引用格式 = /^upl_[A-Za-z0-9_-]{8,}$/u

/** 拒绝来自错误接线或损坏 Repository 读回的内部输入。 */
function 校验内部输入(输入: 创建暂未识别用户植物输入): void {
  const 数量有效 =
    Number.isSafeInteger(输入.currentActiveCount) && 输入.currentActiveCount >= 最小Active数量
  const 时间有效 = Number.isFinite(输入.occurredAtMs)
  const 引用有效 = 用户植物公开引用格式.test(输入.newUserPlantRef)

  if (!数量有效 || !时间有效 || !引用有效) {
    throw new 用户植物创建错误('INTERNAL_INPUT_INVALID', '创建用户植物的内部输入不合法')
  }
}

/**
 * 创建一株合法但暂未识别的用户植物公开投影。
 *
 * 本函数不访问数据库、配置、taxonomy 或 Provider；数量、能力和时间全部由上层以同一请求快照提供。
 */
export function 创建暂未识别用户植物(输入: 创建暂未识别用户植物输入): UserPlantDto {
  校验内部输入(输入)

  const { principal, capabilitySnapshot, occurredAtMs } = 输入
  if (principal.principalType !== 'user') {
    throw new 用户植物创建错误('CAPABILITY_DENIED', '当前主体不能创建用户植物')
  }

  const 主体过期时间 = Date.parse(principal.expiresAt)
  if (!Number.isFinite(主体过期时间) || occurredAtMs >= 主体过期时间) {
    throw new 用户植物创建错误('PRINCIPAL_INVALID', '登录状态已失效')
  }

  if (
    capabilitySnapshot.subjectType !== 'user' ||
    capabilitySnapshot.user_id !== principal.user_id ||
    !capabilitySnapshot.allowedCapabilities.includes('USER_PLANT_CREATE')
  ) {
    throw new 用户植物创建错误('CAPABILITY_DENIED', '当前能力不允许创建用户植物')
  }

  const 快照生成时间 = Date.parse(capabilitySnapshot.generatedAt)
  const 快照过期时间 = Date.parse(capabilitySnapshot.validUntil)
  if (!Number.isFinite(快照生成时间) || occurredAtMs < 快照生成时间) {
    throw new 用户植物创建错误('INTERNAL_INPUT_INVALID', '能力快照时间不合法')
  }
  if (!Number.isFinite(快照过期时间) || occurredAtMs >= 快照过期时间) {
    throw new 用户植物创建错误('CAPABILITY_SNAPSHOT_EXPIRED', '能力快照已失效')
  }

  if (输入.currentActiveCount >= capabilitySnapshot.activeUserPlantLimit) {
    throw new 用户植物创建错误('CAPABILITY_DENIED', '当前可创建的用户植物数量已达上限')
  }

  const 发生时间 = new Date(occurredAtMs).toISOString()
  return {
    user_plant_id: 输入.newUserPlantRef,
    lifecycle: 'active',
    identityStatus: 'unidentified',
    version: 初始版本,
    createdAt: 发生时间,
    updatedAt: 发生时间
  }
}
