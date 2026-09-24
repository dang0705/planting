import type {
  CapabilitySnapshotDto,
  PrincipalDto,
  UserPlantDto,
  UserPlantRef
} from '../../contracts/types.js'
import { isUserPlantCapacityReached } from './user-plant-capacity.js'

/** 创建用户植物领域规则可以产生的稳定拒绝类型。 */
export type UserPlantCreateErrorType =
  | 'PRINCIPAL_INVALID'
  | 'CAPABILITY_DENIED'
  | 'CAPABILITY_SNAPSHOT_EXPIRED'
  | 'INTERNAL_INPUT_INVALID'

/** 领域拒绝由应用层转换为公共 HTTP 错误；异常中不携带内部主键或凭证。 */
export class UserPlantCreateError extends Error {
  /** 稳定拒绝类型；`INTERNAL_INPUT_INVALID` 只能映射为泛化内部错误。 */
  readonly type: UserPlantCreateErrorType

  constructor(type: UserPlantCreateErrorType, message: string) {
    super(message)
    this.name = '用户植物创建错误'
    this.type = type
  }
}

/** 创建一株暂未识别用户植物所需的纯领域输入。 */
export type CreateUnidentifiedUserPlantInput = {
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

const initialVersion = 1
const minActiveCount = 0
const userPlantPublicRefFormat = /^upl_[A-Za-z0-9_-]{8,}$/u

/** 拒绝来自错误接线或损坏 Repository 读回的内部输入。 */
function validateInternalInput(input: CreateUnidentifiedUserPlantInput): void {
  const countIsValid =
    Number.isSafeInteger(input.currentActiveCount) && input.currentActiveCount >= minActiveCount
  const timeIsValid = Number.isFinite(input.occurredAtMs)
  const referenceIsValid = userPlantPublicRefFormat.test(input.newUserPlantRef)

  if (!countIsValid || !timeIsValid || !referenceIsValid) {
    throw new UserPlantCreateError('INTERNAL_INPUT_INVALID', '创建用户植物的内部输入不合法')
  }
}

/**
 * 创建一株合法但暂未识别的用户植物公开投影。
 *
 * 本函数不访问数据库、配置、taxonomy 或 Provider；数量、能力和时间全部由上层以同一请求快照提供。
 */
export function createUnidentifiedUserPlant(input: CreateUnidentifiedUserPlantInput): UserPlantDto {
  validateInternalInput(input)

  const { principal, capabilitySnapshot, occurredAtMs } = input
  if (principal.principalType !== 'user') {
    throw new UserPlantCreateError('CAPABILITY_DENIED', '当前主体不能创建用户植物')
  }

  const principalExpiredTime = Date.parse(principal.expiresAt)
  if (!Number.isFinite(principalExpiredTime) || occurredAtMs >= principalExpiredTime) {
    throw new UserPlantCreateError('PRINCIPAL_INVALID', '登录状态已失效')
  }

  if (
    capabilitySnapshot.subjectType !== 'user' ||
    capabilitySnapshot.user_id !== principal.user_id ||
    !capabilitySnapshot.allowedCapabilities.includes('USER_PLANT_CREATE')
  ) {
    throw new UserPlantCreateError('CAPABILITY_DENIED', '当前能力不允许创建用户植物')
  }

  const snapshotBuildTime = Date.parse(capabilitySnapshot.generatedAt)
  const snapshotExpiredTime = Date.parse(capabilitySnapshot.validUntil)
  if (!Number.isFinite(snapshotBuildTime) || occurredAtMs < snapshotBuildTime) {
    throw new UserPlantCreateError('INTERNAL_INPUT_INVALID', '能力快照时间不合法')
  }
  if (!Number.isFinite(snapshotExpiredTime) || occurredAtMs >= snapshotExpiredTime) {
    throw new UserPlantCreateError('CAPABILITY_SNAPSHOT_EXPIRED', '能力快照已失效')
  }

  if (
    isUserPlantCapacityReached(input.currentActiveCount, capabilitySnapshot.activeUserPlantLimit)
  ) {
    throw new UserPlantCreateError('CAPABILITY_DENIED', '当前可创建的用户植物数量已达上限')
  }

  const occurredTime = new Date(occurredAtMs).toISOString()
  return {
    user_plant_id: input.newUserPlantRef,
    lifecycle: 'active',
    identityStatus: 'unidentified',
    version: initialVersion,
    createdAt: occurredTime,
    updatedAt: occurredTime
  }
}
