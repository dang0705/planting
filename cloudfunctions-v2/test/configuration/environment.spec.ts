import { inspect } from 'node:util'
import { describe, expect, it } from 'vitest'

import {
  CREDENTIAL_ENVIRONMENT_NAMES,
  EnvironmentConfigError,
  OPERATIONAL_ENVIRONMENT_OVERRIDES,
  readCareEnvironment,
  readCareOutboxDispatchEnvironment,
  readCarePlanExpiryEnvironment,
  readFunctionEnvironment,
  readIdentityEnvironment,
  readLogLevel,
  readOperationalOverride,
  readUserPlantEnvironment
} from '../../src/configuration/environment.js'
import { RUNTIME_PARAMETERS } from '../../src/configuration/runtime-parameters.js'
import { DatabaseConfigError } from '../../src/foundation/config/database-config.js'

/**
 * L1 / unit_fake（只替换进程环境变量对象，不连接数据库与 Provider）。
 * Expected 来源：设计说明 `configuration-layers.md` §2.4–§2.6、§4（非法即启动失败且错误不含取值；空串视为未设置；
 * 只有白名单运维参数可覆盖且必须在上下限内；凭证只引用变量名、序列化脱敏）、CLAUDE.md §2「凭证不得进入日志/测试输出/公开响应」、
 * 配置目录 Provider 档案 totalDeadlineMs / connectTimeoutMs（覆盖默认值与下限来源）。
 * 未覆盖：真实 CloudBase 函数环境变量注入、实例重启后生效。
 */
const secret = 'never-print-this-secret-9f3a'
const database = {
  V2_MYSQL_HOST: '10.0.0.8',
  V2_MYSQL_PORT: '3306',
  V2_MYSQL_DATABASE: 'qinghuazhi_v2_test',
  V2_MYSQL_USER: 'qhz_v2_app',
  V2_MYSQL_PASSWORD: secret
}

/** 捕获同步抛出的错误，便于断言错误类型与消息。 */
function capture(action: () => unknown): Error {
  try { action() } catch (error) { return error as Error }
  throw new Error('预期抛错但未抛错')
}

describe('日志级别（运维类，代码默认 info）', () => {
  it('未设置或空串时用代码默认 info', () => {
    expect(readLogLevel({})).toBe('info')
    expect(readLogLevel({ LOG_LEVEL: '  ' })).toBe('info')
  })
  it('合法枚举原样采用', () => {
    expect(readLogLevel({ LOG_LEVEL: 'debug' })).toBe('debug')
    expect(readLogLevel({ LOG_LEVEL: 'silent' })).toBe('silent')
  })
  it('非法值启动失败，错误只含变量名不含取值', () => {
    const error = capture(() => readLogLevel({ LOG_LEVEL: 'verbose-xyz' }))
    expect(error).toBeInstanceOf(EnvironmentConfigError)
    expect(error.message).toContain('LOG_LEVEL')
    expect(error.message).not.toContain('verbose-xyz')
  })
})

describe('运维覆盖白名单（主代理 2026-10-10 裁定：Provider 总时限 + 发件箱租约/每批 + 过期扫描每批，带上下限）', () => {
  // 用户 2026-10-10 第三轮裁定：再加发件箱最大尝试次数、过期扫描时长占比、游客认领租约、服务签名时钟偏差与 nonce 保留。
  it('白名单固定为十二项，默认值来自代码注册表且落在上下限内', () => {
    expect(Object.fromEntries(Object.entries(OPERATIONAL_ENVIRONMENT_OVERRIDES).map(([key, spec]) => [key, [spec.environmentName, spec.defaultValue, spec.minimum, spec.maximum]]))).toEqual({
      wechatLoginTotalDeadlineMs: ['V2_WECHAT_LOGIN_TOTAL_DEADLINE_MS', 5000, 2000, 10_000],
      douyinLoginTotalDeadlineMs: ['V2_DOUYIN_LOGIN_TOTAL_DEADLINE_MS', 5000, 2000, 10_000],
      openMeteoTotalDeadlineMs: ['V2_OPEN_METEO_TOTAL_DEADLINE_MS', 8000, 2000, 15_000],
      cloudbaseStorageTotalDeadlineMs: ['V2_CLOUDBASE_STORAGE_TOTAL_DEADLINE_MS', 10_000, 2000, 20_000],
      careOutboxLeaseSeconds: ['V2_CARE_OUTBOX_LEASE_SECONDS', 30, 10, 120],
      careOutboxBatchSize: ['V2_CARE_OUTBOX_BATCH_SIZE', 100, 20, 500],
      carePlanExpiryBatchSize: ['V2_CARE_PLAN_EXPIRY_BATCH_SIZE', 500, 100, 2000],
      careOutboxMaxAttempts: ['V2_CARE_OUTBOX_MAX_ATTEMPTS', 5, 3, 10],
      carePlanExpiryRunBudgetPercent: ['V2_CARE_PLAN_EXPIRY_RUN_BUDGET_PERCENT', 50, 20, 80],
      userPlantGuestClaimLeaseSeconds: ['V2_USER_PLANT_GUEST_CLAIM_LEASE_SECONDS', 30, 10, 120],
      serviceSignatureClockSkewSeconds: ['V2_SERVICE_SIGNATURE_CLOCK_SKEW_SECONDS', 300, 60, 300],
      serviceSignatureNonceTtlSeconds: ['V2_SERVICE_SIGNATURE_NONCE_TTL_SECONDS', 600, 600, 900]
    })
    expect(OPERATIONAL_ENVIRONMENT_OVERRIDES.wechatLoginTotalDeadlineMs.parameter).toBe(RUNTIME_PARAMETERS.identity.wechatLoginTotalDeadlineMs)
    expect(OPERATIONAL_ENVIRONMENT_OVERRIDES.douyinLoginTotalDeadlineMs.parameter).toBe(RUNTIME_PARAMETERS.identity.douyinLoginTotalDeadlineMs)
    expect(OPERATIONAL_ENVIRONMENT_OVERRIDES.openMeteoTotalDeadlineMs.parameter).toBe(RUNTIME_PARAMETERS.care.openMeteoTotalDeadlineMs)
    expect(OPERATIONAL_ENVIRONMENT_OVERRIDES.cloudbaseStorageTotalDeadlineMs.parameter).toBe(RUNTIME_PARAMETERS.storage.cloudbaseStorageTotalDeadlineMs)
    expect([OPERATIONAL_ENVIRONMENT_OVERRIDES.careOutboxLeaseSeconds.parameter, OPERATIONAL_ENVIRONMENT_OVERRIDES.careOutboxLeaseSeconds.field]).toEqual([RUNTIME_PARAMETERS.care.outboxDispatch, 'leaseSeconds'])
    expect([OPERATIONAL_ENVIRONMENT_OVERRIDES.careOutboxBatchSize.parameter, OPERATIONAL_ENVIRONMENT_OVERRIDES.careOutboxBatchSize.field]).toEqual([RUNTIME_PARAMETERS.care.outboxDispatch, 'batchSize'])
    expect([OPERATIONAL_ENVIRONMENT_OVERRIDES.carePlanExpiryBatchSize.parameter, OPERATIONAL_ENVIRONMENT_OVERRIDES.carePlanExpiryBatchSize.field]).toEqual([RUNTIME_PARAMETERS.care.planExpiryScan, 'batchSize'])
    for (const spec of Object.values(OPERATIONAL_ENVIRONMENT_OVERRIDES)) {
      const value = spec.parameter.value as unknown
      const registryDefault = spec.field === null ? value : (value as Record<string, unknown>)[spec.field]
      expect(spec.defaultValue / spec.scale).toBe(registryDefault)
      expect(spec.minimum).toBeLessThanOrEqual(spec.defaultValue)
      expect(spec.defaultValue).toBeLessThanOrEqual(spec.maximum)
      expect(spec.decidedAt).toBe('2026-10-10')
    }
  })

  it('业务参数（已迁入策略发布）与触发器 cron 不在环境变量白名单', () => {
    const covered = Object.values(OPERATIONAL_ENVIRONMENT_OVERRIDES).map(spec => `${spec.parameter.source.kind === 'catalog_variable' ? spec.parameter.source.catalogKey : spec.parameter.source.providerCode}#${spec.field ?? ''}`)
    for (const forbidden of ['care.outbox_dispatch#cron', 'care.plans.expiry_scan#cron', 'care.plans.expiry_grace_hours#', 'care.watering.drying_gap_fill_max_hours#', 'care.plans.page_size#', 'http.idempotency.retention_hours#']) {
      expect(covered).not.toContain(forbidden)
    }
  })

  it('服务签名：时钟偏差与 nonce 保留可覆盖；越界启动失败（错误不含取值）', () => {
    expect(readIdentityEnvironment(database).serviceSignature).toEqual({ clockSkewSeconds: 300, nonceTtlSeconds: 600 })
    expect(readIdentityEnvironment({ ...database, V2_SERVICE_SIGNATURE_CLOCK_SKEW_SECONDS: '120', V2_SERVICE_SIGNATURE_NONCE_TTL_SECONDS: '700' }).serviceSignature)
      .toEqual({ clockSkewSeconds: 120, nonceTtlSeconds: 700 })
    const error = capture(() => readIdentityEnvironment({ ...database, V2_SERVICE_SIGNATURE_CLOCK_SKEW_SECONDS: '300', V2_SERVICE_SIGNATURE_NONCE_TTL_SECONDS: '599' }))
    expect(error).toBeInstanceOf(EnvironmentConfigError)
    expect(error.message).not.toContain('599')
    // 登记范围（偏差 60–300、nonce 600–900）已保证 nonce ≥ 2 × 偏差；交叉校验作为防线保留在 environment.ts。
  })

  it('过期扫描时长占比：整数百分比换算为比例，越界启动失败', () => {
    expect(readCarePlanExpiryEnvironment(database).runBudgetFraction).toBe(0.5)
    expect(readCarePlanExpiryEnvironment({ ...database, V2_CARE_PLAN_EXPIRY_RUN_BUDGET_PERCENT: '80' }).runBudgetFraction).toBe(0.8)
    expect(capture(() => readCarePlanExpiryEnvironment({ ...database, V2_CARE_PLAN_EXPIRY_RUN_BUDGET_PERCENT: '81' }))).toBeInstanceOf(EnvironmentConfigError)
  })

  it('发件箱最大尝试次数与游客认领租约：默认 5 / 30，可在范围内覆盖', () => {
    expect(readCareOutboxDispatchEnvironment(database).outboxDispatch.maxAttempts).toBe(5)
    expect(readCareOutboxDispatchEnvironment({ ...database, V2_CARE_OUTBOX_MAX_ATTEMPTS: '10' }).outboxDispatch.maxAttempts).toBe(10)
    expect(capture(() => readCareOutboxDispatchEnvironment({ ...database, V2_CARE_OUTBOX_MAX_ATTEMPTS: '2' }))).toBeInstanceOf(EnvironmentConfigError)
    expect(readUserPlantEnvironment(database).guestClaimLeaseSeconds).toBe(30)
    expect(readUserPlantEnvironment({ ...database, V2_USER_PLANT_GUEST_CLAIM_LEASE_SECONDS: '120' }).guestClaimLeaseSeconds).toBe(120)
  })
  it('未设置或空串用代码默认；合法整数在范围内采用', () => {
    expect(readOperationalOverride({}, 'openMeteoTotalDeadlineMs')).toBe(8000)
    expect(readOperationalOverride({ V2_OPEN_METEO_TOTAL_DEADLINE_MS: '' }, 'openMeteoTotalDeadlineMs')).toBe(8000)
    expect(readOperationalOverride({ V2_OPEN_METEO_TOTAL_DEADLINE_MS: '12000' }, 'openMeteoTotalDeadlineMs')).toBe(12_000)
    expect(readOperationalOverride({ V2_OPEN_METEO_TOTAL_DEADLINE_MS: '2000' }, 'openMeteoTotalDeadlineMs')).toBe(2000)
    expect(readOperationalOverride({ V2_OPEN_METEO_TOTAL_DEADLINE_MS: '15000' }, 'openMeteoTotalDeadlineMs')).toBe(15_000)
  })
  it.each([['1999'], ['15001'], ['8s'], ['8000.5'], ['-8000'], ['0x1f40'], ['1e4']])('非法或越界 %s 启动失败，错误不含取值', raw => {
    const error = capture(() => readOperationalOverride({ V2_OPEN_METEO_TOTAL_DEADLINE_MS: raw }, 'openMeteoTotalDeadlineMs'))
    expect(error).toBeInstanceOf(EnvironmentConfigError)
    expect(error.message).toContain('V2_OPEN_METEO_TOTAL_DEADLINE_MS')
    expect(error.message).toContain('2000')
    expect(error.message).toContain('15000')
    expect(error.message).not.toContain(raw)
  })
})

describe('各云函数环境读取器', () => {
  it('readFunctionEnvironment：日志级别 + 严格数据库参数；数据库缺失仍由 DatabaseConfigError 失败关闭', () => {
    expect(readFunctionEnvironment(database)).toEqual({
      logLevel: 'info',
      database: { host: '10.0.0.8', port: 3306, database: 'qinghuazhi_v2_test', user: 'qhz_v2_app', password: secret }
    })
    expect(capture(() => readFunctionEnvironment({}))).toBeInstanceOf(DatabaseConfigError)
  })

  it('readCareEnvironment：Open-Meteo 总时限默认 8000，可在范围内覆盖', () => {
    expect(readCareEnvironment(database).openMeteoTotalDeadlineMs).toBe(8000)
    expect(readCareEnvironment({ ...database, V2_OPEN_METEO_TOTAL_DEADLINE_MS: '9000' }).openMeteoTotalDeadlineMs).toBe(9000)
  })

  it('readCareOutboxDispatchEnvironment：租约 / 每批默认 30 秒 / 100，可在范围内覆盖，越界启动失败', () => {
    expect(readCareOutboxDispatchEnvironment(database).outboxDispatch).toEqual({ leaseSeconds: 30, batchSize: 100, maxAttempts: 5 })
    expect(readCareOutboxDispatchEnvironment({ ...database, V2_CARE_OUTBOX_LEASE_SECONDS: '120', V2_CARE_OUTBOX_BATCH_SIZE: '20' }).outboxDispatch).toEqual({ leaseSeconds: 120, batchSize: 20, maxAttempts: 5 })
    expect(capture(() => readCareOutboxDispatchEnvironment({ ...database, V2_CARE_OUTBOX_LEASE_SECONDS: '9' }))).toBeInstanceOf(EnvironmentConfigError)
    expect(capture(() => readCareOutboxDispatchEnvironment({ ...database, V2_CARE_OUTBOX_BATCH_SIZE: '501' }))).toBeInstanceOf(EnvironmentConfigError)
  })

  it('readCarePlanExpiryEnvironment：每批默认 500，可在 100–2000 覆盖，越界启动失败', () => {
    expect(readCarePlanExpiryEnvironment(database).expiryBatchSize).toBe(500)
    expect(readCarePlanExpiryEnvironment({ ...database, V2_CARE_PLAN_EXPIRY_BATCH_SIZE: '2000' }).expiryBatchSize).toBe(2000)
    expect(capture(() => readCarePlanExpiryEnvironment({ ...database, V2_CARE_PLAN_EXPIRY_BATCH_SIZE: '99' }))).toBeInstanceOf(EnvironmentConfigError)
  })

  it('readIdentityEnvironment：登录总时限默认 5000；平台凭证原样交给 Adapter，序列化与 inspect 均脱敏', () => {
    const environment = readIdentityEnvironment({
      ...database,
      WECHAT_MINIPROGRAM_APPID: 'wx-app',
      WECHAT_MINIPROGRAM_PRIVATE_KEY: secret,
      DOUYIN_APPID: 'dy-app',
      DOUYIN_APP_SECRET: secret,
      PLATFORM_SUBJECT_HMAC_KEY_V1: secret,
      UNRELATED_VARIABLE: 'must-not-pass-through'
    })
    expect(environment.wechatLoginTotalDeadlineMs).toBe(5000)
    expect(environment.douyinLoginTotalDeadlineMs).toBe(5000)
    expect(environment.platformLogin.WECHAT_MINIPROGRAM_PRIVATE_KEY).toBe(secret)
    expect(environment.platformLogin.DOUYIN_APPID).toBe('dy-app')
    expect(Object.keys(environment.platformLogin).sort()).toEqual(['DOUYIN_APPID', 'DOUYIN_APP_SECRET', 'PLATFORM_SUBJECT_HMAC_KEY_V1', 'WECHAT_MINIPROGRAM_APPID', 'WECHAT_MINIPROGRAM_PRIVATE_KEY'])
    expect(JSON.stringify(environment.platformLogin)).not.toContain(secret)
    expect(inspect(environment.platformLogin)).not.toContain(secret)
    expect(String(environment.platformLogin)).not.toContain(secret)
  })

  it('readIdentityEnvironment：凭证缺失不阻断启动（各平台自行失败关闭）', () => {
    const environment = readIdentityEnvironment(database)
    expect(environment.platformLogin.WECHAT_MINIPROGRAM_APPID).toBeUndefined()
  })

  it('任一校验失败时，错误信息不包含任何凭证值', () => {
    const error = capture(() => readIdentityEnvironment({ ...database, WECHAT_MINIPROGRAM_PRIVATE_KEY: secret, V2_WECHAT_LOGIN_TOTAL_DEADLINE_MS: '99999' }))
    expect(error).toBeInstanceOf(EnvironmentConfigError)
    expect(error.message).not.toContain(secret)
    expect(error.message).not.toContain('99999')
  })

  it('readUserPlantEnvironment：缺环境 ID 不创建存储；有则凭证按变量名在调用时读取、时限默认 10000', () => {
    expect(readUserPlantEnvironment(database).storage).toBeNull()
    const environment: Record<string, string | undefined> = { ...database, V2_CLOUDBASE_ENV_ID: 'env-1' }
    const storage = readUserPlantEnvironment(environment).storage
    expect(storage?.envId).toBe('env-1')
    expect(storage?.totalDeadlineMs).toBe(10_000)
    expect(storage?.readApiKey()).toBeUndefined()
    environment.CLOUDBASE_STORAGE_API_KEY = secret
    expect(storage?.readApiKey()).toBe(secret)
    expect(JSON.stringify(storage)).not.toContain(secret)
  })

  it('凭证变量名清单只登记名字', () => {
    expect([...CREDENTIAL_ENVIRONMENT_NAMES].sort()).toEqual([
      'CLOUDBASE_STORAGE_API_KEY', 'DOUYIN_APPID', 'DOUYIN_APP_SECRET', 'PLATFORM_SUBJECT_HMAC_KEY_V1', 'V2_MYSQL_PASSWORD',
      'WECHAT_MINIPROGRAM_APPID', 'WECHAT_MINIPROGRAM_PRIVATE_KEY'
    ])
  })
})
