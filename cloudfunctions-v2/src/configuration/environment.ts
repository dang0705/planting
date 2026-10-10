import { inspect } from 'node:util'

import { readDatabaseConnectionConfig, type DatabaseConnectionConfig } from '../foundation/config/database-config.js'
import { RUNTIME_PARAMETERS, type RuntimeParameter } from './runtime-parameters.js'

/**
 * 环境变量层统一入口（configuration-layers/v1 §2.4–§2.6、§4）。
 *
 * 通俗说明：像前端用 schema 校验过的 `env.ts`——所有 `process.env` 只在这里读取、校验并产出类型化对象，
 * 入口文件只调用 `read*Environment(process.env)`。部署时生效（云函数环境变量 / 本地 .env.local），改动需重启实例。
 *
 * 规则：
 * - 非法（类型、范围、枚举）即启动失败，抛 `EnvironmentConfigError`；错误信息只含变量名与允许范围，绝不含取值。
 * - 空字符串视为未设置，回退到代码层默认值（runtime-parameters.ts）。
 * - 只有 `OPERATIONAL_ENVIRONMENT_OVERRIDES` 白名单内的运维参数可覆盖代码默认值，且必须在上下限内；业务硬规则不开放。
 * - 凭证只登记变量名；凭证容器序列化 / inspect 一律输出 `[已脱敏]`；凭证缺失不阻断启动，由对应平台失败关闭。
 */

/** 环境变量来源：通常是 `process.env`，测试中传入普通对象。 */
export type EnvironmentSource = Readonly<Record<string, string | undefined>>

/** 环境变量缺失、非法或越界；消息只包含变量名与允许范围，不包含任何取值。 */
export class EnvironmentConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EnvironmentConfigError'
  }
}

/** pino 支持的日志级别；`LOG_LEVEL` 只接受这些值。 */
export const LOG_LEVELS = Object.freeze(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const)

/** 日志级别类型。 */
export type LogLevel = (typeof LOG_LEVELS)[number]

/** 日志级别环境变量名；未设置时代码默认 info。 */
const logLevelEnvironmentName = 'LOG_LEVEL'
/** 日志级别代码默认值。 */
const defaultLogLevel: LogLevel = 'info'

/** 凭证类环境变量名清单：只登记名字，值只交给 Adapter，不打印、不记录、不进入错误信息。 */
export const CREDENTIAL_ENVIRONMENT_NAMES = Object.freeze([
  'V2_MYSQL_PASSWORD',
  'WECHAT_MINIPROGRAM_APPID',
  'WECHAT_MINIPROGRAM_PRIVATE_KEY',
  'DOUYIN_APPID',
  'DOUYIN_APP_SECRET',
  'PLATFORM_SUBJECT_HMAC_KEY_V1',
  'CLOUDBASE_STORAGE_API_KEY',
] as const)

/** 平台登录凭证变量名（凭证清单的子集）。 */
const platformLoginCredentialNames = [
  'WECHAT_MINIPROGRAM_APPID',
  'WECHAT_MINIPROGRAM_PRIVATE_KEY',
  'DOUYIN_APPID',
  'DOUYIN_APP_SECRET',
  'PLATFORM_SUBJECT_HMAC_KEY_V1',
] as const

/** CloudBase 云存储 API Key 的凭证变量名（配置目录 Provider `cloudbase_storage.credentialRef`）。 */
const storageCredentialEnvironmentName = 'CLOUDBASE_STORAGE_API_KEY'
/** CloudBase 云存储网关环境 ID 变量名；缺失时不创建存储 Provider。 */
const storageEnvironmentIdName = 'V2_CLOUDBASE_ENV_ID'

/** 一个允许环境变量覆盖的运维参数规格。 */
export interface OperationalOverrideSpec {
  /** 覆盖用的环境变量名（V2_ 前缀）。 */
  readonly environmentName: string
  /** 代码层默认值所在的注册表参数（Provider 档案字段，或目录复合参数）。 */
  readonly parameter: RuntimeParameter<unknown>
  /** 复合参数中被覆盖的字段名；参数本身即数值时为 null。 */
  readonly field: string | null
  /** 代码层默认值（环境变量单位；除以 scale 后与注册表对应字段相等，由测试保证）。 */
  readonly defaultValue: number
  /** 环境变量单位到运行值的换算除数：通常为 1；百分比类为 100（例如 50 → 0.5）。 */
  readonly scale: number
  /** 允许覆盖的最小整数（含）。 */
  readonly minimum: number
  /** 允许覆盖的最大整数（含）；同时是下游守卫（如 SQL LIMIT 校验）的上限。 */
  readonly maximum: number
  /** 主代理裁定日期（YYYY-MM-DD）。 */
  readonly decidedAt: string
}

/** 声明一个白名单运维覆盖项（冻结）。 */
function override(environmentName: string, parameter: RuntimeParameter<unknown>, field: string | null, defaultValue: number, minimum: number, maximum: number, scale = 1): OperationalOverrideSpec {
  return Object.freeze({ environmentName, parameter, field, defaultValue, minimum, maximum, scale, decidedAt: '2026-10-10' })
}

/**
 * 运维覆盖白名单（2026-10-10 裁定为正式规则）：Provider 总时限（下限取档案 connectTimeoutMs）、发件箱租约 / 每批 / 最大尝试次数、
 * 过期扫描每批 / 时长占比、游客认领租约、服务签名时钟偏差与 nonce 保留。业务参数（时长、天数、分页等）在策略发布里，不在此列；
 * 正文绝对上限与触发器 cron 不可经环境变量调整。
 */
export const OPERATIONAL_ENVIRONMENT_OVERRIDES = Object.freeze({
  /** 微信登录 Provider 总时限毫秒。 */
  wechatLoginTotalDeadlineMs: override('V2_WECHAT_LOGIN_TOTAL_DEADLINE_MS', RUNTIME_PARAMETERS.identity.wechatLoginTotalDeadlineMs, null, RUNTIME_PARAMETERS.identity.wechatLoginTotalDeadlineMs.value, 2000, 10_000),
  /** 抖音登录 / 匿名信号 Provider 总时限毫秒。 */
  douyinLoginTotalDeadlineMs: override('V2_DOUYIN_LOGIN_TOTAL_DEADLINE_MS', RUNTIME_PARAMETERS.identity.douyinLoginTotalDeadlineMs, null, RUNTIME_PARAMETERS.identity.douyinLoginTotalDeadlineMs.value, 2000, 10_000),
  /** Open-Meteo 辐射预报 Provider 总时限毫秒。 */
  openMeteoTotalDeadlineMs: override('V2_OPEN_METEO_TOTAL_DEADLINE_MS', RUNTIME_PARAMETERS.care.openMeteoTotalDeadlineMs, null, RUNTIME_PARAMETERS.care.openMeteoTotalDeadlineMs.value, 2000, 15_000),
  /** CloudBase 云存储 Provider 总时限毫秒。 */
  cloudbaseStorageTotalDeadlineMs: override('V2_CLOUDBASE_STORAGE_TOTAL_DEADLINE_MS', RUNTIME_PARAMETERS.storage.cloudbaseStorageTotalDeadlineMs, null, RUNTIME_PARAMETERS.storage.cloudbaseStorageTotalDeadlineMs.value, 2000, 20_000),
  /** 发件箱领取后租约秒数（`care.outbox_dispatch.leaseSeconds`）。 */
  careOutboxLeaseSeconds: override('V2_CARE_OUTBOX_LEASE_SECONDS', RUNTIME_PARAMETERS.care.outboxDispatch, 'leaseSeconds', RUNTIME_PARAMETERS.care.outboxDispatch.value.leaseSeconds, 10, 120),
  /** 发件箱单次最多领取条数（`care.outbox_dispatch.batchSize`）。 */
  careOutboxBatchSize: override('V2_CARE_OUTBOX_BATCH_SIZE', RUNTIME_PARAMETERS.care.outboxDispatch, 'batchSize', RUNTIME_PARAMETERS.care.outboxDispatch.value.batchSize, 20, 500),
  /** 过期扫描单批最多改写行数（`care.plans.expiry_scan.batchSize`）。 */
  carePlanExpiryBatchSize: override('V2_CARE_PLAN_EXPIRY_BATCH_SIZE', RUNTIME_PARAMETERS.care.planExpiryScan, 'batchSize', RUNTIME_PARAMETERS.care.planExpiryScan.value.batchSize, 100, 2000),
  /** 发件箱最大尝试次数（`care.outbox_dispatch.maxAttempts`；用户 2026-10-10 第三轮裁定）。 */
  careOutboxMaxAttempts: override('V2_CARE_OUTBOX_MAX_ATTEMPTS', RUNTIME_PARAMETERS.care.outboxDispatch, 'maxAttempts', RUNTIME_PARAMETERS.care.outboxDispatch.value.maxAttempts, 3, 10),
  /** 过期扫描单次运行时长占函数超时的整数百分比（`care.plans.expiry_scan.runBudgetFractionOfFunctionTimeout` × 100）。 */
  carePlanExpiryRunBudgetPercent: override('V2_CARE_PLAN_EXPIRY_RUN_BUDGET_PERCENT', RUNTIME_PARAMETERS.care.planExpiryScan, 'runBudgetFractionOfFunctionTimeout',
    Math.round(RUNTIME_PARAMETERS.care.planExpiryScan.value.runBudgetFractionOfFunctionTimeout * 100), 20, 80, 100),
  /** 游客认领处理中租约秒数（`user-plant.guest_claim.processing_lease_seconds`）。 */
  userPlantGuestClaimLeaseSeconds: override('V2_USER_PLANT_GUEST_CLAIM_LEASE_SECONDS', RUNTIME_PARAMETERS.userPlant.guestClaimProcessingLeaseSeconds, null,
    RUNTIME_PARAMETERS.userPlant.guestClaimProcessingLeaseSeconds.value, 10, 120),
  /** 服务签名允许时钟偏差秒数（签名方与验证方所有函数必须部署同一取值）。 */
  serviceSignatureClockSkewSeconds: override('V2_SERVICE_SIGNATURE_CLOCK_SKEW_SECONDS', RUNTIME_PARAMETERS.identity.serviceSignatureClockSkewSeconds, null,
    RUNTIME_PARAMETERS.identity.serviceSignatureClockSkewSeconds.value, 60, 300),
  /** 服务签名 nonce 防重放保留秒数（必须 ≥ 2 × 时钟偏差）。 */
  serviceSignatureNonceTtlSeconds: override('V2_SERVICE_SIGNATURE_NONCE_TTL_SECONDS', RUNTIME_PARAMETERS.identity.serviceSignatureNonceTtlSeconds, null,
    RUNTIME_PARAMETERS.identity.serviceSignatureNonceTtlSeconds.value, 600, 900),
})

/** 运维覆盖白名单的键。 */
export type OperationalOverrideKey = keyof typeof OPERATIONAL_ENVIRONMENT_OVERRIDES

/** 十进制非负整数（不接受符号、小数、科学计数法、十六进制）。 */
const decimalIntegerPattern = /^(?:0|[1-9][0-9]*)$/u

/** 读取并去除首尾空白；空串视为未设置。 */
function readOptional(environment: EnvironmentSource, name: string): string | undefined {
  const raw = environment[name]?.trim()
  return raw === undefined || raw === '' ? undefined : raw
}

/** 读取日志级别：未设置用 info；不在枚举内即启动失败（错误不含取值）。 */
export function readLogLevel(environment: EnvironmentSource): LogLevel {
  const raw = readOptional(environment, logLevelEnvironmentName)
  if (raw === undefined) { return defaultLogLevel }
  const level = LOG_LEVELS.find(candidate => candidate === raw)
  if (level === undefined) {
    throw new EnvironmentConfigError(`环境变量不合法：${logLevelEnvironmentName}（允许 ${LOG_LEVELS.join('/')}）`)
  }
  return level
}

/** 读取一个白名单运维参数：未设置用代码默认；非十进制整数或越界即启动失败（错误不含取值）。 */
export function readOperationalOverride(environment: EnvironmentSource, key: OperationalOverrideKey): number {
  const spec: OperationalOverrideSpec = OPERATIONAL_ENVIRONMENT_OVERRIDES[key]
  const raw = readOptional(environment, spec.environmentName)
  if (raw === undefined) { return spec.defaultValue / spec.scale }
  const value = Number(raw)
  if (!decimalIntegerPattern.test(raw) || !Number.isSafeInteger(value) || value < spec.minimum || value > spec.maximum) {
    throw new EnvironmentConfigError(`环境变量不合法：${spec.environmentName}（允许 ${spec.minimum}–${spec.maximum} 的整数）`)
  }
  return value / spec.scale
}

/** 为凭证容器挂上不可枚举的脱敏序列化，防止被日志或 JSON 意外输出。 */
function redactCredentials<T extends object>(container: T): T {
  const redacted = () => '[已脱敏]'
  Object.defineProperty(container, 'toJSON', { value: redacted, enumerable: false })
  Object.defineProperty(container, 'toString', { value: redacted, enumerable: false })
  Object.defineProperty(container, inspect.custom, { value: redacted, enumerable: false })
  return Object.freeze(container)
}

/** 所有云函数共用的环境：日志级别 + 数据库连接参数。 */
export interface FunctionEnvironment {
  /** 日志级别（运维类，默认 info）。 */
  readonly logLevel: LogLevel
  /** 数据库连接参数；缺失或非法时由 `DatabaseConfigError` 启动失败。 */
  readonly database: DatabaseConnectionConfig
}

/** 读取所有云函数共用的环境；数据库参数沿用 foundation 的严格校验。 */
export function readFunctionEnvironment(environment: EnvironmentSource): FunctionEnvironment {
  return { logLevel: readLogLevel(environment), database: readDatabaseConnectionConfig(environment) }
}

/** 平台登录凭证容器（字段名即凭证变量名，与 identity 登录分派器的环境接口结构一致）。 */
export interface PlatformLoginCredentials {
  /** 微信小程序 AppID。 */
  readonly WECHAT_MINIPROGRAM_APPID?: string
  /** 微信小程序 AppSecret（凭证引用 env:WECHAT_MINIPROGRAM_PRIVATE_KEY）。 */
  readonly WECHAT_MINIPROGRAM_PRIVATE_KEY?: string
  /** 抖音小程序 AppID。 */
  readonly DOUYIN_APPID?: string
  /** 抖音小程序 AppSecret。 */
  readonly DOUYIN_APP_SECRET?: string
  /** 平台主体 HMAC 密钥 v1，base64 编码。 */
  readonly PLATFORM_SUBJECT_HMAC_KEY_V1?: string
}

/** identity 云函数环境。 */
export interface IdentityEnvironment extends FunctionEnvironment {
  /** 平台登录凭证（只含白名单凭证变量，序列化脱敏）；缺失项为 undefined，由对应平台失败关闭。 */
  readonly platformLogin: PlatformLoginCredentials
  /** 微信登录 Provider 总时限毫秒（代码默认 5000，可在白名单范围内覆盖）。 */
  readonly wechatLoginTotalDeadlineMs: number
  /** 抖音登录 / 匿名信号 Provider 总时限毫秒（代码默认 5000，可在白名单范围内覆盖）。 */
  readonly douyinLoginTotalDeadlineMs: number
  /** 服务间签名参数（签名方与验证方共用同一组环境变量）。 */
  readonly serviceSignature: ServiceSignatureEnvironment
}

/** 服务间签名参数。 */
export interface ServiceSignatureEnvironment {
  /** 允许的请求时间与服务端时间绝对差（秒）。 */
  readonly clockSkewSeconds: number
  /** nonce 占用后的最少保留秒数；必须不小于 2 × clockSkewSeconds，否则在偏差窗口内可能重放。 */
  readonly nonceTtlSeconds: number
}

/** 读取服务签名参数并做跨字段校验（错误不含取值）。 */
export function readServiceSignatureEnvironment(environment: EnvironmentSource): ServiceSignatureEnvironment {
  const clockSkewSeconds = readOperationalOverride(environment, 'serviceSignatureClockSkewSeconds')
  const nonceTtlSeconds = readOperationalOverride(environment, 'serviceSignatureNonceTtlSeconds')
  if (nonceTtlSeconds < 2 * clockSkewSeconds) {
    throw new EnvironmentConfigError('环境变量不合法：V2_SERVICE_SIGNATURE_NONCE_TTL_SECONDS 必须不小于 2 × V2_SERVICE_SIGNATURE_CLOCK_SKEW_SECONDS')
  }
  return Object.freeze({ clockSkewSeconds, nonceTtlSeconds })
}

/** 读取 identity 云函数环境；先校验运维参数，再收拢凭证，任何错误信息都不含凭证值。 */
export function readIdentityEnvironment(environment: EnvironmentSource): IdentityEnvironment {
  const base = readFunctionEnvironment(environment)
  const wechatLoginTotalDeadlineMs = readOperationalOverride(environment, 'wechatLoginTotalDeadlineMs')
  const douyinLoginTotalDeadlineMs = readOperationalOverride(environment, 'douyinLoginTotalDeadlineMs')
  const credentials: Record<string, string | undefined> = {}
  for (const name of platformLoginCredentialNames) { credentials[name] = environment[name] }
  return { ...base, platformLogin: redactCredentials(credentials as PlatformLoginCredentials), wechatLoginTotalDeadlineMs, douyinLoginTotalDeadlineMs,
    serviceSignature: readServiceSignatureEnvironment(environment) }
}

/** care 云函数环境。 */
export interface CareEnvironment extends FunctionEnvironment {
  /** Open-Meteo 辐射预报总时限毫秒（代码默认 8000，可在白名单范围内覆盖）。 */
  readonly openMeteoTotalDeadlineMs: number
}

/** 读取 care 云函数环境。 */
export function readCareEnvironment(environment: EnvironmentSource): CareEnvironment {
  return { ...readFunctionEnvironment(environment), openMeteoTotalDeadlineMs: readOperationalOverride(environment, 'openMeteoTotalDeadlineMs') }
}

/** care-outbox-dispatch 事件函数环境。 */
export interface CareOutboxDispatchEnvironment extends FunctionEnvironment {
  /** 发件箱运维参数（租约秒数、每批条数）；最大尝试次数为硬规则不在此。 */
  readonly outboxDispatch: {
    /** 领取后租约秒数（默认 30，允许 10–120）。 */
    readonly leaseSeconds: number
    /** 单次最多领取条数（默认 100，允许 20–500）。 */
    readonly batchSize: number
    /** 最大尝试次数（默认 5，允许 3–10）；第 maxAttempts 次仍失败进入死信。 */
    readonly maxAttempts: number
  }
}

/** 读取 care-outbox-dispatch 事件函数环境。 */
export function readCareOutboxDispatchEnvironment(environment: EnvironmentSource): CareOutboxDispatchEnvironment {
  return {
    ...readFunctionEnvironment(environment),
    outboxDispatch: Object.freeze({
      leaseSeconds: readOperationalOverride(environment, 'careOutboxLeaseSeconds'),
      batchSize: readOperationalOverride(environment, 'careOutboxBatchSize'),
      maxAttempts: readOperationalOverride(environment, 'careOutboxMaxAttempts'),
    }),
  }
}

/** care-plan-expiry 事件函数环境。 */
export interface CarePlanExpiryEnvironment extends FunctionEnvironment {
  /** 过期扫描单批最多改写行数（默认 500，允许 100–2000）；宽限小时数来自策略发布 care/long_term_rules。 */
  readonly expiryBatchSize: number
  /** 单次运行时长上限占函数超时的比例（默认 0.5；环境变量为整数百分比 20–80）。 */
  readonly runBudgetFraction: number
}

/** 读取 care-plan-expiry 事件函数环境。 */
export function readCarePlanExpiryEnvironment(environment: EnvironmentSource): CarePlanExpiryEnvironment {
  return { ...readFunctionEnvironment(environment), expiryBatchSize: readOperationalOverride(environment, 'carePlanExpiryBatchSize'),
    runBudgetFraction: readOperationalOverride(environment, 'carePlanExpiryRunBudgetPercent') }
}

/** 云存储 Provider 运行配置。 */
export interface CloudbaseStorageEnvironment {
  /** CloudBase 网关环境 ID。 */
  readonly envId: string
  /** 在调用时按凭证变量名读取 API Key；值不缓存、不记录。 */
  readonly readApiKey: () => string | undefined
  /** 云存储 Provider 总时限毫秒（代码默认 10000，可在白名单范围内覆盖）。 */
  readonly totalDeadlineMs: number
}

/** user-plant 云函数环境。 */
export interface UserPlantEnvironment extends FunctionEnvironment {
  /** 云存储配置；缺少环境 ID 时为 null（不创建 Provider，封面登记 503）。 */
  readonly storage: CloudbaseStorageEnvironment | null
  /** 游客认领处理中租约秒数（默认 30，允许 10–120）。 */
  readonly guestClaimLeaseSeconds: number
}

/** 读取 user-plant 云函数环境；存储 API Key 只在调用时按变量名读取。 */
export function readUserPlantEnvironment(environment: EnvironmentSource): UserPlantEnvironment {
  const base = readFunctionEnvironment(environment)
  const totalDeadlineMs = readOperationalOverride(environment, 'cloudbaseStorageTotalDeadlineMs')
  const envId = environment[storageEnvironmentIdName]
  const storage = envId
    ? Object.freeze({ envId, readApiKey: () => environment[storageCredentialEnvironmentName], totalDeadlineMs })
    : null
  return { ...base, storage, guestClaimLeaseSeconds: readOperationalOverride(environment, 'userPlantGuestClaimLeaseSeconds') }
}
