import type { RewardableDomainEventDto, RewardEventType } from '../../contracts'

/** 可以产生已冻结奖励资格事实的四个业务域。 */
export type RewardEventProducerDomain = RewardableDomainEventDto['producerDomain']

/** 把已校验的奖励事件收窄为当前 Repository 所属生产域。 */
export type CurrentDomainRewardEvent<TProducerDomain extends RewardEventProducerDomain> = RewardableDomainEventDto & {
  /** 已与事件类型及当前 Repository 双重核对的生产域，调用方不能跨域改写。 */
  readonly producerDomain: TProducerDomain
}

/**
 * 准备写入某一业务域 outbox 的最小内部记录。
 *
 * 这里只表达不可变事件信封和初始状态；数据库内部主键、租约、尝试次数和派发时间由
 * Repository / dispatcher 管理，不能由领域调用方注入。
 */
export type PendingRewardEventRecord<TProducerDomain extends RewardEventProducerDomain = RewardEventProducerDomain> = {
  /** 当前 Repository 所属生产域；用于阻止调用方把事件写入其他域的 outbox。 */
  readonly producerDomain: TProducerDomain
  /** 已由生产域生成并通过公开奖励事件 Schema 的完整信封；重试时不得改写 eventId。 */
  readonly event: CurrentDomainRewardEvent<TProducerDomain>
  /** 新事件只能以 pending 入库；租约、重试和终态均由后续受控派发流程推进。 */
  readonly status: 'pending'
}

/** 奖励事件机械合同被破坏时抛出的内部稳定错误；原始事件不得进入公开错误或日志。 */
export class RewardEventContractError extends Error {
  /**
   * @param message 仅描述违反的合同类别，不包含载荷值、凭证、私有路径或模型原文。
   */
  constructor(message: string) {
    super(message)
    this.name = '奖励事件合同错误'
  }
}

/** 每种奖励事实唯一允许的生产域；Foundation 只执行映射校验，不计算奖励。 */
const eventProducerDomainMap = {
  'user_plant.profile_completed.v1': 'user-plant',
  'care.soil_check_completed.v1': 'care',
  'care.fertilizing_check_completed.v1': 'care',
  'diagnosis.fixed_package_completed.v1': 'diagnosis',
  'knowledge.contribution_released.v1': 'plant-knowledge'
} as const satisfies Record<RewardEventType, RewardEventProducerDomain>

/**
 * 奖励资格载荷禁止出现的字段名。
 *
 * 比较前会移除连字符和下划线并转为小写，避免 `trace_id`、`traceId` 等命名差异绕过。
 * 该集合只保护冻结合同明确禁止的内容，不尝试替代领域专属 payload Schema。
 */
const forbiddenPayloadField = new Set([
  'points',
  'pointamount',
  'amount',
  'aiquota',
  'credential',
  'credentialref',
  'password',
  'secret',
  'token',
  'authorization',
  'cookie',
  'prompt',
  'modelrawoutput',
  'rawmodeloutput',
  'sql',
  'sessionid',
  'traceid',
  'databaseinternalid',
  'internalid',
  'privateobjectpath'
])

/** 把字段名归一化为安全比较形式，不修改实际持久化载荷。 */
function normalizeFieldName(fieldName: string): string {
  return fieldName.replaceAll('_', '').replaceAll('-', '').toLowerCase()
}

/**
 * 递归检查 JSON 风格载荷的键名；只检查字段名，不读取或拼接字段值到错误信息。
 * 循环引用不是合法 JSON，遇到时按合同错误拒绝，避免递归失控。
 */
function assertPayloadFieldSafe(value: unknown, visitedObject = new WeakSet<object>()): void {
  if (value === null || typeof value !== 'object') {
    return
  }

  if (visitedObject.has(value)) {
    throw new RewardEventContractError('奖励事件载荷必须是无循环引用的 JSON 对象')
  }
  visitedObject.add(value)

  if (Array.isArray(value)) {
    for (const element of value) {
      assertPayloadFieldSafe(element, visitedObject)
    }
    return
  }

  for (const [fieldName, fieldValue] of Object.entries(value)) {
    if (forbiddenPayloadField.has(normalizeFieldName(fieldName))) {
      throw new RewardEventContractError('奖励事件载荷包含禁止字段')
    }
    assertPayloadFieldSafe(fieldValue, visitedObject)
  }
}

/**
 * 校验事件确实属于当前生产域，并生成只能由该域 Repository 持久化的 pending 记录。
 *
 * 本函数不生成事件 ID、不重算 payloadHash、不访问数据库，也不启动 dispatcher；这些边界
 * 分别属于生产域、规范化哈希合同、Repository 和尚未冻结运行参数的 P3 派发流程。
 */
export function createPendingRewardEventRecord<TProducerDomain extends RewardEventProducerDomain>(
  currentProducerDomain: TProducerDomain,
  event: RewardableDomainEventDto
): PendingRewardEventRecord<TProducerDomain> {
  if (event.producerDomain !== currentProducerDomain) {
    throw new RewardEventContractError('奖励事件生产域不一致')
  }

  if (eventProducerDomainMap[event.eventType] !== currentProducerDomain) {
    throw new RewardEventContractError('奖励事件类型与生产域不匹配')
  }

  if (event.eventType !== 'knowledge.contribution_released.v1' && !event.userPlantRef) {
    throw new RewardEventContractError('该奖励事件必须携带用户植物公开引用')
  }

  assertPayloadFieldSafe(event.payload)

  return {
    producerDomain: currentProducerDomain,
    event: event as CurrentDomainRewardEvent<TProducerDomain>,
    status: 'pending'
  }
}
