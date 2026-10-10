import Ajv, { type AnySchema } from 'ajv'

/**
 * 类型化业务策略定义（configuration-layers/v2 §3）。
 *
 * 通俗说明：像前端远程配置的「配置项 schema」——每个策略都有固定的业务域 + 策略代码、允许的正文版本，
 * 以及一个把数据库里的 JSON 正文校验并冻结成只读对象的 `resolve`。校验不过一律返回 null，调用方按「策略不可用」处理（HTTP 503），
 * 绝不回退源码默认值。
 */
export interface TypedPolicyDefinition<T> {
  /** 业务域代码（business_policy_releases.domain_code），例如 `care`。 */
  readonly domainCode: string
  /** 策略代码（business_policy_releases.policy_code），例如 `long_term_rules`；禁止万能键值。 */
  readonly policyCode: string
  /** 读取方接受的正文 Schema 版本（business_policy_releases.schema_version），按新旧顺序列出。 */
  readonly schemaVersions: readonly string[]
  /** 校验并冻结正文；结构、范围或跨字段规则任一不合法返回 null。 */
  readonly resolve: (document: unknown, schemaVersion: string) => Readonly<T> | null
}

/** 共享的严格 AJV 实例：禁止未知关键字、整数与数字分开校验。 */
const ajv = new Ajv({ strict: true, allErrors: true, strictNumbers: true })

/** 编译一份正文 Schema（模块加载时编译一次）。 */
export function compilePolicySchema<T>(schema: AnySchema): (value: unknown) => value is T {
  const validate = ajv.compile<T>(schema)
  return (value: unknown): value is T => validate(value) === true
}

/** 递归冻结，保证请求内快照只读。 */
export function freezePolicy<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) { freezePolicy(child) }
    Object.freeze(value)
  }
  return value
}

/** 整数区间 Schema 片段（含端点）。 */
export const integerWithin = (minimum: number, maximum: number) => ({ type: 'integer', minimum, maximum }) as const

/** 分页 Schema 片段：default 与 max 均为 1～上限的整数；default ≤ max 由跨字段规则复核。 */
export const pageSizeSchema = (maximum: number) => ({
  type: 'object', additionalProperties: false, required: ['default', 'max'],
  properties: { default: integerWithin(1, maximum), max: integerWithin(1, maximum) },
}) as const

/** 分页取值：省略 limit 时的默认条数与允许的最大条数。 */
export interface PolicyPageSize {
  /** 省略 limit 时返回的条数。 */
  readonly default: number
  /** 允许的最大 limit；不超过对应合同的 maxItems 绝对上限。 */
  readonly max: number
}
