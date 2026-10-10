/**
 * 代码层运行参数注册表（configuration-layers/v2，docs/backend-v2/architecture/configuration-layers.md）。
 *
 * 用户 2026-10-10 方针：日常维护以「环境变量 + 策略发布」为主，业务参数尽量少用代码常量。因此本文件只保留两类：
 * 1. 运维参数的**代码默认值**（Provider 总时限、发件箱租约 / 每批 / 重试、过期扫描每批 / 时长占比、认领租约、服务签名参数），
 *    由 environment.ts 白名单在登记上下限内由部署环境变量覆盖；
 * 2. 协议 / 安全 / 数据完整性与 Schema **硬边界**（请求体绝对上限、外部 Provider 文档上限、数据结构上限、各策略的绝对边界 `policyBounds`）。
 * 有业务含义的值（时长、天数、分页、条数、上传限制、算法参数）一律在策略发布（BusinessPolicyRelease）里，不得回到本文件。
 *
 * 约束：每项必须登记来源（配置目录变量或 Provider 档案字段），取值与目录完全相等，由测试保证；本文件超过 500 行前须按领域拆分。
 */

/** 参数来源：配置目录中的业务 / 治理变量。 */
export interface CatalogVariableSource {
  /** 来源类别：目录变量。 */
  readonly kind: 'catalog_variable'
  /** 配置目录 `variables[].id`，例如 `care.plans.expiry_grace_hours`。 */
  readonly catalogKey: string
}

/** 参数来源：配置目录中某个已冻结 Provider 档案的字段。 */
export interface ProviderProfileSource {
  /** 来源类别：Provider 档案字段。 */
  readonly kind: 'provider_profile'
  /** 配置目录 `providerProfiles[].providerCode`，例如 `open_meteo`。 */
  readonly providerCode: string
  /** 档案字段名，例如 `totalDeadlineMs`。 */
  readonly field: string
}

/** 一个运行参数：来源 + 单位 + 冻结取值。 */
export interface RuntimeParameter<T> {
  /** 取值的权威来源（目录变量或 Provider 档案字段），用于一致性测试与审计追溯。 */
  readonly source: CatalogVariableSource | ProviderProfileSource
  /** 取值单位的中文说明（与目录 unit 一致；复合值写明各字段单位）。 */
  readonly unit: string
  /** 冻结取值；与目录 currentValue 完全相等，复合值深度只读。 */
  readonly value: T
}

/** 递归冻结对象，保证复合取值在运行时不可被改写。 */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) { deepFreeze(child) }
    Object.freeze(value)
  }
  return value
}

/** 声明一个来源于目录变量的参数。 */
function fromCatalog<T>(catalogKey: string, unit: string, value: T): RuntimeParameter<T> {
  return deepFreeze({ source: { kind: 'catalog_variable', catalogKey }, unit, value })
}

/** 声明一个来源于 Provider 档案字段的参数。 */
function fromProvider<T>(providerCode: string, field: string, unit: string, value: T): RuntimeParameter<T> {
  return deepFreeze({ source: { kind: 'provider_profile', providerCode, field }, unit, value })
}

/** HTTP 公共合同参数（所有业务云函数共享）。 */
const http = {
  /** 普通 JSON 请求体字节上限（`http.json_body_limit_bytes`）：防攻击绝对上限，必须在读入内存前判定，不能依赖数据库读取，故不进入策略。 */
  jsonBodyLimitBytes: fromCatalog('http.json_body_limit_bytes', '字节', 1_048_576),
}

/** identity 域运维参数默认值（环境变量可覆盖）。 */
const identity = {
  /** 服务间签名允许的时钟偏差秒数默认（`identity.service_signature.clock_skew_seconds`；V2_SERVICE_SIGNATURE_CLOCK_SKEW_SECONDS 60–300）。 */
  serviceSignatureClockSkewSeconds: fromCatalog('identity.service_signature.clock_skew_seconds', '秒', 300),
  /** 服务间签名 nonce 防重放保留秒数默认（`identity.service_signature.nonce_ttl_seconds`；V2_SERVICE_SIGNATURE_NONCE_TTL_SECONDS 600–900）。 */
  serviceSignatureNonceTtlSeconds: fromCatalog('identity.service_signature.nonce_ttl_seconds', '秒', 600),
  /** 微信 code2Session 总时限毫秒（Provider `wechat_miniprogram_login.totalDeadlineMs`）；运维可经环境变量在上下限内覆盖。 */
  wechatLoginTotalDeadlineMs: fromProvider('wechat_miniprogram_login', 'totalDeadlineMs', '毫秒', 5000),
  /** 抖音登录 / 匿名信号换取总时限毫秒（Provider `douyin_miniprogram_login.totalDeadlineMs`）；运维可覆盖。 */
  douyinLoginTotalDeadlineMs: fromProvider('douyin_miniprogram_login', 'totalDeadlineMs', '毫秒', 5000),
}

/**
 * care 域运维参数默认值与外部硬上限。
 * 过期宽限、补记天数、推迟上限、建议有效期、计划分页已迁入策略发布 care/long_term_rules；缺段补齐与光照系数并入 care/mvp_watering v4。
 */
const care = {
  /**
   * 过期扫描运行参数（`care.plans.expiry_scan`）。cron / intervalHours 是 CloudBase 触发器部署配置的说明值（必须与触发器一致）；
   * batchSize（V2_CARE_PLAN_EXPIRY_BATCH_SIZE 100–2000）与 runBudgetFractionOfFunctionTimeout（V2_CARE_PLAN_EXPIRY_RUN_BUDGET_PERCENT 20–80）为运维默认值。
   */
  planExpiryScan: fromCatalog('care.plans.expiry_scan', 'cron / 小时 / 行 / 比例', {
    // 用户 2026-10-10 裁定：并入低频补扫 care-maintenance-sweep，cron 与 care.maintenance_sweep 一致，最大间隔 4 小时。
    cron: '0 25 0,4,7,11,14,16,19,21 * * * *',
    intervalHours: 4,
    batchSize: 500,
    runBudgetFractionOfFunctionTimeout: 0.5,
  }),
  /**
   * 发件箱派发参数（`care.outbox_dispatch`）。cron 为触发器部署配置说明值；leaseSeconds / batchSize / maxAttempts 为运维默认值，
   * 分别由 V2_CARE_OUTBOX_LEASE_SECONDS（10–120）、V2_CARE_OUTBOX_BATCH_SIZE（20–500）、V2_CARE_OUTBOX_MAX_ATTEMPTS（3–10）覆盖。
   */
  outboxDispatch: fromCatalog('care.outbox_dispatch', 'cron / 秒 / 条 / 次', {
    // 用户 2026-10-10 裁定：写入时顺带派发 + 低频补扫；补扫 cron 与 care.maintenance_sweep 一致（必须与触发器一致）。
    cron: '0 25 0,4,7,11,14,16,19,21 * * * *',
    leaseSeconds: 30,
    batchSize: 100,
    maxAttempts: 5,
  }),
  /** 写入时顺带派发的最长等待毫秒（`care.outbox_dispatch.inline_budget_ms`，用户 2026-10-10 裁定）；运维可经 V2_CARE_OUTBOX_INLINE_BUDGET_MS 在 200–3000 覆盖。 */
  outboxInlineDispatchBudgetMs: fromCatalog('care.outbox_dispatch.inline_budget_ms', '毫秒', 1500),
  /**
   * 合并低频补扫（`care.maintenance_sweep`，用户 2026-10-10 裁定）：cron 为 CloudBase 7 段（北京时间），对齐 weather 定时任务醒库时段，必须与触发器一致；
   * maxGapHours 为两次运行最大间隔（说明最长滞后）；outboxBudgetFractionOfFunctionTimeout 为发件箱补扫阶段占函数超时的比例，其余时长留给过期扫描。
   */
  maintenanceSweep: fromCatalog('care.maintenance_sweep', 'cron / 小时 / 比例', {
    cron: '0 25 0,4,7,11,14,16,19,21 * * * *',
    maxGapHours: 4,
    outboxBudgetFractionOfFunctionTimeout: 0.3,
  }),
  /** Open-Meteo 辐射预报总时限毫秒（Provider `open_meteo.totalDeadlineMs`）；运维可经环境变量在上下限内覆盖。 */
  openMeteoTotalDeadlineMs: fromProvider('open_meteo', 'totalDeadlineMs', '毫秒', 8000),
  /** Open-Meteo 请求回看 / 预报天数上限（`care.lighting.open_meteo_request_window_days`）：Provider 官方文档硬上限，策略与代码都不能超过。 */
  openMeteoRequestWindowDays: fromCatalog('care.lighting.open_meteo_request_window_days', '天', { maxPastDays: 92, maxForecastDays: 16 }),
}

/** 共享云存储运维参数（消费方：user-plant 入口）。 */
const storage = {
  /** CloudBase 云存储 HTTP API 总时限毫秒（Provider `cloudbase_storage.totalDeadlineMs`）；运维可覆盖。 */
  cloudbaseStorageTotalDeadlineMs: fromProvider('cloudbase_storage', 'totalDeadlineMs', '毫秒', 10_000),
}

/** user-plant 域运维默认值与数据结构硬边界；列表分页、封面资产规则已迁入策略发布。 */
const userPlant = {
  /** 游客认领处理中租约秒数默认（`user-plant.guest_claim.processing_lease_seconds`；V2_USER_PLANT_GUEST_CLAIM_LEASE_SECONDS 10–120）。 */
  guestClaimProcessingLeaseSeconds: fromCatalog('user-plant.guest_claim.processing_lease_seconds', '秒', 30),
  /** 每株最多有效封面数（`user-plant.assets.max_count_per_plant`）：数据结构只支持单张当前封面，提高需改 DDL，不是运营参数。 */
  coverMaxCountPerPlant: fromCatalog('user-plant.assets.max_count_per_plant', '张', 1),
}

/**
 * 各策略发布的代码层绝对边界（目录 `*.absolute_bounds`，硬规则）：策略 AJV Schema 以此为上下限，策略只能在边界内调整，
 * 不能突破已发布合同、OpenAPI 的 maxItems 或数据库列长度。
 */
const policyBounds = {
  /** care/long_term_rules：时长上下限与计划分页上限（50 = 合同 maxItems）。 */
  careLongTermRules: fromCatalog('care.long_term_rules.absolute_bounds', '小时 / 天 / 条', {
    planExpiryGraceHours: { min: 1, max: 720 }, wateringBackfillMaxDays: { min: 1, max: 90 }, checkMaxPostponeDays: { min: 1, max: 90 },
    openWindowProposalValidHours: { min: 1, max: 168 }, planPageSizeMax: 50,
  }),
  /** care/mvp_watering v4 运行字段：缺段补齐小时、PPFD/GHI 物理上界、室内实测覆盖小时。 */
  careWateringRuntime: fromCatalog('care.watering.runtime_absolute_bounds', '小时 / μmol/J / 小时', {
    dryingGapFillMaxHours: { min: 0, max: 24 }, maximumPpfdPerGhi: { min: 1.8, max: 3 }, indoorClimateWindowHours: { min: 1, max: 72 },
  }),
  /** plant-knowledge/public_search：查询长度 255 = 被搜索列最大长度；引用 512 = catalog_taxon_ref 列长；结果 20 = 合同上限；limit 最小 1。 */
  plantKnowledgePublicSearch: fromCatalog('plant-knowledge.public_search.absolute_bounds', 'Unicode 码点 / 条', {
    searchQueryMaxCodePoints: 255, searchResultMaxItems: 20, encyclopediaReferenceMaxCodePoints: 512, catalogMinimumLimit: 1,
    /** 三轴筛选每页绝对上限 = plant-visual-axis-filter/v1 items maxItems（用户 2026-10-10 审定）。 */
    visualFilterMaxItems: 50,
  }),
  /** weather/public_read：推荐条数绝对上限（合同上限）。 */
  weatherPublicRead: fromCatalog('weather.public_read.absolute_bounds', '条', { recommendTopMax: 50 }),
  /** user-plant/list_rules：分页上限（合同与 OpenAPI maxItems）。 */
  userPlantListRules: fromCatalog('user-plant.list_rules.absolute_bounds', '条', { pageSizeMax: 50 }),
  /** user-plant/asset_rules：清理天数、单图字节上下限与代码已实现魔数识别的 MIME 全集。 */
  userPlantAssetRules: fromCatalog('user-plant.asset_rules.absolute_bounds', '天 / 字节 / MIME', {
    replacedCoverCleanupDays: { min: 1, max: 90 }, maxImageBytes: { min: 65_536, max: 10_485_760 }, supportedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'] as const,
  }),
  /** http/request_write：幂等保留期上下限；正文上限为防攻击绝对值（只能等于 http.jsonBodyLimitBytes）。 */
  httpRequestWrite: fromCatalog('http.request_write.absolute_bounds', '小时 / 字节', {
    idempotencyRetentionHours: { min: 24, max: 720 }, jsonBodyLimitBytes: 1_048_576,
  }),
}

/**
 * 代码层运行参数注册表：按领域分组的只读对象。
 * 读取方式：`RUNTIME_PARAMETERS.care.outboxDispatch.value`；运维参数的生效值以 environment.ts 读取结果为准（可能被环境变量覆盖）。
 */
export const RUNTIME_PARAMETERS = deepFreeze({ http, identity, care, storage, userPlant, policyBounds })
