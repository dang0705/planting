/**
 * 代码层运行参数注册表（configuration-layers/v1 §2–§3，docs/backend-v2/architecture/configuration-layers.md）。
 *
 * 通俗说明：它就是后端的 `constants.ts`——所有「将来可能调整、但随版本发布」的数值集中在这里定义一次，
 * 各领域文件只从这里读取并做单位换算，不再各自写死。
 *
 * 约束：
 * - 每项必须登记来源：配置目录变量（`catalogKey`）或配置目录 Provider 档案字段（`providerCode` + `field`）；
 *   取值必须与目录完全相等（由 test/configuration/runtime-parameters.spec.ts 保证），不得收录目录中 pending 的项。
 * - 目录中为 hard_rule 的业务规则只在这里定义，任何环境变量都不得覆盖；
 *   只有 environment.ts 白名单里的运维参数（Provider 总时限、发件箱租约 / 每批、过期扫描每批）才可在部署时于上下限内覆盖默认值。
 * - 运行时可切换的业务策略（浇水、玻璃、用户植物额度、身份会话、AI 额度）不在这里，仍走数据库策略发布。
 * - 本文件超过 500 行前须按领域拆分为子模块。
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
  /** 普通 JSON 请求体字节上限（`http.json_body_limit_bytes`，已冻结）；超过即 413，解析前检查。 */
  jsonBodyLimitBytes: fromCatalog('http.json_body_limit_bytes', '字节', 1_048_576),
  /** 写接口幂等结果保留小时数（`http.idempotency.retention_hours`，已冻结）；保留期内同键同参返回首次结果。 */
  idempotencyRetentionHours: fromCatalog('http.idempotency.retention_hours', '小时', 168),
}

/** identity 域参数。 */
const identity = {
  /** 服务间签名允许的时钟偏差秒数（`identity.service_signature.clock_skew_seconds`）；超出返回 401。 */
  serviceSignatureClockSkewSeconds: fromCatalog('identity.service_signature.clock_skew_seconds', '秒', 300),
  /** 服务间签名 nonce 防重放保留秒数（`identity.service_signature.nonce_ttl_seconds`）。 */
  serviceSignatureNonceTtlSeconds: fromCatalog('identity.service_signature.nonce_ttl_seconds', '秒', 600),
  /** 微信 code2Session 总时限毫秒（Provider `wechat_miniprogram_login.totalDeadlineMs`）；运维可经环境变量在上下限内覆盖。 */
  wechatLoginTotalDeadlineMs: fromProvider('wechat_miniprogram_login', 'totalDeadlineMs', '毫秒', 5000),
  /** 抖音登录 / 匿名信号换取总时限毫秒（Provider `douyin_miniprogram_login.totalDeadlineMs`）；运维可覆盖。 */
  douyinLoginTotalDeadlineMs: fromProvider('douyin_miniprogram_login', 'totalDeadlineMs', '毫秒', 5000),
}

/** plant-knowledge 域参数（全部为目录硬规则，不允许环境变量覆盖）。 */
const plantKnowledge = {
  /** 搜索关键词最大 Unicode 码点数（`plant-knowledge.search.query_max_code_points`，硬规则）。 */
  searchQueryMaxCodePoints: fromCatalog('plant-knowledge.search.query_max_code_points', 'Unicode 码点', 64),
  /** 搜索单次最多返回条数（`plant-knowledge.search.result_max_items`，硬规则）；超出时 truncated=true。 */
  searchResultMaxItems: fromCatalog('plant-knowledge.search.result_max_items', '条', 20),
  /** 目录搜索省略 limit 时的默认条数（`plant-knowledge.catalog.default_limit`，硬规则）。 */
  catalogDefaultLimit: fromCatalog('plant-knowledge.catalog.default_limit', '条', 10),
  /** 目录搜索 limit 最小值（`plant-knowledge.catalog.minimum_limit`，硬规则）。 */
  catalogMinimumLimit: fromCatalog('plant-knowledge.catalog.minimum_limit', '条', 1),
  /** 百科分类引用与 slug 的最大 Unicode 码点数（`plant-knowledge.encyclopedia.reference_max_code_points`，硬规则）。 */
  encyclopediaReferenceMaxCodePoints: fromCatalog('plant-knowledge.encyclopedia.reference_max_code_points', 'Unicode 码点', 512),
}

/**
 * care 域参数（目录硬规则；例外：Open-Meteo 总时限、发件箱 leaseSeconds / batchSize、过期扫描 batchSize
 * 经主代理 2026-10-10 裁定为运维参数，可由 environment.ts 白名单在上下限内覆盖，此处为代码默认值）。
 */
const care = {
  /** 检查计划过期宽限小时数（`care.plans.expiry_grace_hours`，硬规则）：planned 且超过计划时刻 72 小时即过期。 */
  planExpiryGraceHours: fromCatalog('care.plans.expiry_grace_hours', '小时', 72),
  /**
   * 过期扫描运行参数（`care.plans.expiry_scan`，硬规则）。
   * cron 为 CloudBase 7 段（秒 分 时 日 月 星期 年）；intervalHours 为扫描间隔小时；batchSize 为单批（单短事务）最多改写行数；
   * runBudgetFractionOfFunctionTimeout 为单次运行时长上限占函数超时的比例。
   */
  planExpiryScan: fromCatalog('care.plans.expiry_scan', 'cron / 小时 / 行 / 比例', {
    cron: '0 0 * * * * *',
    intervalHours: 1,
    batchSize: 500,
    runBudgetFractionOfFunctionTimeout: 0.5,
  }),
  /**
   * 发件箱派发参数（`care.outbox_dispatch`，硬规则）：每分钟一次，每条领取后占用租约 leaseSeconds 秒，
   * 单次最多领取 batchSize 条，第 maxAttempts 次仍失败进入死信。
   */
  outboxDispatch: fromCatalog('care.outbox_dispatch', 'cron / 秒 / 条 / 次', {
    cron: '0 * * * * * *',
    leaseSeconds: 30,
    batchSize: 100,
    maxAttempts: 5,
  }),
  /** 环境数据缺段可保守补齐的最长小时数（`care.watering.drying_gap_fill_max_hours`，硬规则）。 */
  dryingGapFillMaxHours: fromCatalog('care.watering.drying_gap_fill_max_hours', '小时', 6),
  /** 浇水事实最长补记天数（`care.facts.watering_backfill_max_days`，硬规则）。 */
  wateringBackfillMaxDays: fromCatalog('care.facts.watering_backfill_max_days', '天', 7),
  /** 检查窗口无最晚端时检查计划最多推迟天数（`care.plans.check_max_postpone_days`，硬规则）。 */
  checkMaxPostponeDays: fromCatalog('care.plans.check_max_postpone_days', '天', 7),
  /** 检查窗口无最晚端时建议有效小时数（`care.watering.open_window_proposal_valid_hours`，硬规则）。 */
  openWindowProposalValidHours: fromCatalog('care.watering.open_window_proposal_valid_hours', '小时', 24),
  /** 计划列表分页（`care.plans.page_size`，硬规则）：省略 limit 用 default，超过 max 拒绝。 */
  planPageSize: fromCatalog('care.plans.page_size', '条', { default: 20, max: 50 }),
  /** Open-Meteo 辐射预报总时限毫秒（Provider `open_meteo.totalDeadlineMs`）；运维可经环境变量在上下限内覆盖。 */
  openMeteoTotalDeadlineMs: fromProvider('open_meteo', 'totalDeadlineMs', '毫秒', 8000),
  /** Open-Meteo 请求回看 / 预报天数上限（`care.lighting.open_meteo_request_window_days`，硬规则，官方允许范围）。 */
  openMeteoRequestWindowDays: fromCatalog('care.lighting.open_meteo_request_window_days', '天', { maxPastDays: 92, maxForecastDays: 16 }),
}

/** 共享云存储参数（消费方：user-plant 入口）。 */
const storage = {
  /** CloudBase 云存储 HTTP API 总时限毫秒（Provider `cloudbase_storage.totalDeadlineMs`）；运维可覆盖。 */
  cloudbaseStorageTotalDeadlineMs: fromProvider('cloudbase_storage', 'totalDeadlineMs', '毫秒', 10_000),
  /** 允许上传的图片类型（`storage.upload.allowed_mime_types`，已冻结）；按文件魔数判断，不信任声明类型。 */
  uploadAllowedMimeTypes: fromCatalog('storage.upload.allowed_mime_types', 'MIME 类型', ['image/jpeg', 'image/png', 'image/webp'] as const),
  /** 单张图片字节上限（`storage.upload.max_image_bytes`，已冻结，5 MiB）。 */
  uploadMaxImageBytes: fromCatalog('storage.upload.max_image_bytes', '字节', 5_242_880),
}

/** user-plant 域参数（目录硬规则或已冻结代码常量；运行时切换的额度与档案规则仍走策略发布）。 */
const userPlant = {
  /** 游客认领处理中租约秒数（`user-plant.guest_claim.processing_lease_seconds`，硬规则）。 */
  guestClaimProcessingLeaseSeconds: fromCatalog('user-plant.guest_claim.processing_lease_seconds', '秒', 30),
  /** 植物列表分页（`user-plant.list.page_size`，硬规则）：省略 limit 用 default，超过 max 拒绝。 */
  listPageSize: fromCatalog('user-plant.list.page_size', '条', { default: 20, max: 50 }),
  /** 时间线分页（`user-plant.timeline.page_size`，硬规则）。 */
  timelinePageSize: fromCatalog('user-plant.timeline.page_size', '条', { default: 20, max: 50 }),
  /** 每株最多有效封面数（`user-plant.assets.max_count_per_plant`，已冻结）。 */
  coverMaxCountPerPlant: fromCatalog('user-plant.assets.max_count_per_plant', '张', 1),
  /** 换下的旧封面最早可清理天数（`user-plant.assets.replaced_cover_cleanup_days`，已冻结）。 */
  replacedCoverCleanupDays: fromCatalog('user-plant.assets.replaced_cover_cleanup_days', '天', 7),
}

/** weather 域参数（目录硬规则，接口 Schema 边界）。 */
const weather = {
  /** 城市气候推荐接口 top 最大值（`weather.city_climate.recommend_top_max`，硬规则，主代理 2026-10-10 登记）。 */
  recommendTopMaxItems: fromCatalog('weather.city_climate.recommend_top_max', '条', 50),
}

/**
 * 代码层运行参数注册表：按领域分组的只读对象。
 * 读取方式：`RUNTIME_PARAMETERS.care.planExpiryGraceHours.value`；需要毫秒时在消费方换算。
 */
export const RUNTIME_PARAMETERS = deepFreeze({ http, identity, plantKnowledge, care, storage, userPlant, weather })
