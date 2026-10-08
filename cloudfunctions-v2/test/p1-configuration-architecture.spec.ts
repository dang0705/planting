import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'vitest'

import { findProjectRoot } from './support/project-root.js'

// Expected 来源：用户确认的“关键业务变量可配置、第三方 Provider 统一配置”前置架构要求，以及已裁决的分类权威分层。
// 测试层次：unit_real_data；读取真实架构、计划和治理制品，不访问云端或业务实现。
test('P1 配置治理、业务变量与 Provider 档案形成可审计闭环', () => {
const root = findProjectRoot()
const files = {
  readme: fs.readFileSync(path.join(root, 'README.md'), 'utf8'),
  plan: fs.readFileSync(path.join(root, '青花植后端v2底层架构重构计划_融合闭环终版.md'), 'utf8'),
  infrastructure: fs.readFileSync(path.join(root, 'docs/backend-v2/architecture/infrastructure.md'), 'utf8'),
  business: fs.readFileSync(path.join(root, 'docs/backend-v2/architecture/business-domain.md'), 'utf8'),
  mapping: fs.readFileSync(path.join(root, 'docs/backend-v2/architecture/business-to-technical-map.md'), 'utf8'),
  rules: fs.readFileSync(path.join(root, 'docs/backend-v2/architecture/architecture-rules.md'), 'utf8'),
  agents: fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8'),
}
const contractPath = path.join(root, 'docs/backend-v2/architecture/configuration-and-providers.md')
const catalogPath = path.join(root, 'docs/backend-v2/architecture/configuration-variable-catalog.json')
const catalogReadmePath = path.join(root, 'docs/backend-v2/architecture/configuration-variable-catalog.md')
const manifestPath = path.join(root, 'docs/backend-v2/architecture/manifest.json')

/** 业务配置目录中每个变量必须暴露的可审计字段。 */
interface ConfigurationVariable extends Record<string, unknown> {
  id: string
  domain: string
  layer: string
  status: string
  currentValue: unknown
  sourceRefs: string[]
  consumers: string[]
  ticketTitle: string
  expected: string
  decisionGroup: string
  pendingReason?: string
  blockingScope?: string
  allowed?: unknown
  /** Expected 与目录静态验收的最小测试元数据，禁止只写不可追溯的结论。 */
  testMetadata?: {
    level?: string
    expectedSource?: string
    coverage?: string
    notCovered?: string
  }
}

/** 第三方能力配置档案的最小索引字段。 */
interface ProviderProfile extends Record<string, unknown> {
  providerCode: string
  sourceRefs: string[]
  decisionGroup: string
  /** Provider 档案必须声明当前静态测试覆盖范围，避免冒充真实调用验收。 */
  testMetadata?: {
    level?: string
    expectedSource?: string
    coverage?: string
    notCovered?: string
  }
}

/** ClickUp 绑定只保存公开任务定位信息和负责代理名称。 */
interface TicketBinding {
  id: string
  url: string
  agents: string[]
}

interface ConfigurationCatalog {
  schemaVersion: string
  variables: ConfigurationVariable[]
  providerProfiles: ProviderProfile[]
  configurationDecisionGroups: Record<string, unknown>
  ticketBindings: Record<string, TicketBinding>
  /** 目录静态校验的 Expected 来源与明确未覆盖边界。 */
  validationMetadata: {
    variable: Required<NonNullable<ConfigurationVariable['testMetadata']>>
    providerProfile: Required<NonNullable<ProviderProfile['testMetadata']>>
  }
}

assert.ok(fs.existsSync(contractPath), '缺少配置与 Provider 架构合同')
assert.ok(fs.existsSync(catalogPath), '缺少完整业务配置变量目录')
assert.ok(fs.existsSync(catalogReadmePath), '缺少业务配置变量中文阅读版')
assert.ok(fs.existsSync(manifestPath), '缺少架构制品 SHA-256 清单')
const contract = fs.readFileSync(contractPath, 'utf8')
for (const term of [
  'configuration-provider-architecture/v1',
  '部署与密钥配置',
  '第三方能力配置',
  '领域业务策略',
  'credential_ref',
  '请求级配置快照',
  '最近一个已验证版本',
  '不可配置硬规则',
]) { assert.ok(contract.includes(term), `配置架构合同缺少：${term}`) }

const catalogRaw = fs.readFileSync(catalogPath, 'utf8')
const catalogReadme = fs.readFileSync(catalogReadmePath, 'utf8')
const catalog = JSON.parse(catalogRaw) as ConfigurationCatalog
assert.equal(catalog.schemaVersion, 'configuration-variable-catalog/v1')
assert.ok(catalogReadme.includes('## Expected 与测试边界'), '中文阅读版缺少 Expected 与测试边界')
assert.ok(catalog.variables.length >= 150, `关键变量目录不足 150 项，当前 ${catalog.variables.length} 项`)

const requiredDomains = [
  'identity', 'subscription', 'plant-knowledge', 'user-plant', 'care', 'diagnosis',
  'storage', 'http', 'reliable-events', 'observability', 'configuration',
]
const ids = new Set()
for (const [kind, metadata] of Object.entries(catalog.validationMetadata)) {
  assert.equal(metadata.level, 'unit_real_data', `${kind} 测试层次必须为目录真实数据校验`)
  for (const field of ['expectedSource', 'coverage', 'notCovered'] as const) {
    assert.ok(metadata[field].trim(), `${kind} 测试元数据缺少 ${field}`)
  }
}
/**
 * 来源引用只允许使用仓库内相对路径，片段必须能在 Markdown 源文件中定位。
 * 这避免了“文件存在但引用章节已被删改”仍被目录误判为可追溯。
 */
const assertSourceRefResolvable = (sourceRef: string, owner: string): void => {
  const [sourcePath, fragment] = sourceRef.split('#', 2)
  assert.ok(sourcePath && !path.isAbsolute(sourcePath) && !sourcePath.includes('..'), `${owner} 来源路径不安全：${sourceRef}`)
  const absolutePath = path.join(root, sourcePath)
  assert.ok(fs.existsSync(absolutePath), `${owner} 的来源路径不存在：${sourceRef}`)
  if (fragment) {
    const source = fs.readFileSync(absolutePath, 'utf8')
    assert.ok(source.includes(fragment), `${owner} 的来源片段不可解析：${sourceRef}`)
  }
}
for (const variable of catalog.variables) {
  for (const field of [
    'id', 'chineseName', 'domain', 'layer', 'valueType', 'status', 'currentValue',
    'owner', 'sourceRefs', 'consumers', 'changePolicy', 'fallback', 'phase',
    'ticketTitle', 'expected',
    'decisionGroup',
  ]) { assert.ok(variable[field] !== undefined, `${variable.id ?? '未知变量'} 缺少字段 ${field}`) }
  assert.match(variable.id, /^[a-z][a-z0-9_.-]+$/, `配置 ID 不合法：${variable.id}`)
  assert.ok(!ids.has(variable.id), `配置 ID 重复：${variable.id}`)
  ids.add(variable.id)
  assert.ok(['confirmed', 'pending', 'hard_rule'].includes(variable.status), `${variable.id} 状态不合法`)
  assert.ok(['domain_policy', 'provider_runtime', 'deployment_secret', 'hard_rule'].includes(variable.layer), `${variable.id} 层级不合法`)
  assert.ok(catalog.configurationDecisionGroups[variable.decisionGroup], `${variable.id} 缺少有效配置化裁决组`)
  assert.ok(Array.isArray(variable.sourceRefs) && variable.sourceRefs.length > 0, `${variable.id} 缺少事实来源`)
  assert.ok(Array.isArray(variable.consumers) && variable.consumers.length > 0, `${variable.id} 缺少消费方`)
  if (variable.status === 'pending') {
    assert.ok(variable.pendingReason, `${variable.id} 待冻结但没有原因`)
    assert.ok(variable.blockingScope, `${variable.id} 待冻结但没有阻断范围`)
  }
  for (const sourceRef of variable.sourceRefs) {
    assertSourceRefResolvable(sourceRef, variable.id)
  }
  assert.ok(variable.expected.trim().length > 0, `${variable.id} 缺少可验证 Expected`)
  assert.ok(catalog.ticketBindings[variable.ticketTitle], `${variable.id} 没有真实 ClickUp ticket 绑定：${variable.ticketTitle}`)
  assert.ok(catalogReadme.includes(`\`${variable.id}\``), `中文阅读版缺少变量：${variable.id}`)
}
for (const domain of requiredDomains) {
  assert.ok(catalog.variables.some((item) => item.domain === domain), `关键变量目录缺少领域：${domain}`)
}

for (const requiredId of [
  'subscription.trial.duration_hours',
  'subscription.trial.ai_points',
  'subscription.member.ai_points_per_cycle',
  'subscription.ai_cost.safety_factor',
  'subscription.ai_budget.monthly_cny',
  'plant-knowledge.cms.identity_reward_points',
  'plant-knowledge.cms.content_reward_points',
  'user-plant.free.active_limit',
  'care.soil_evidence.ttl_hours',
  'diagnosis.model.family',
  'storage.unbound_retention_hours',
  'http.json_body_limit_bytes',
  'configuration.request_snapshot.immutable',
  'subscription.capability.catalog',
  'subscription.trial.once_per_user',
  'plant-knowledge.enrichment.worker_concurrency',
  'plant-knowledge.enrichment.sort_order',
  'user-plant.identity.current_states',
  'plant-knowledge.taxonomy.authority_allowlist',
  'care.output.status_values',
  'diagnosis.result.terminal_states',
  'subscription.ai_action.agent_text',
  'subscription.ai_action.diagnosis_visual_multi',
]) { assert.ok(ids.has(requiredId), `关键变量目录缺少：${requiredId}`) }

const requiredProviders = [
  'baidu_plant', 'taxonomy_authority', 'bailian_qwen_diagnosis', 'bailian_qwen_enrichment',
  'qweather', 'wechat_pay', 'platform_notification', 'cloudbase_storage', 'cloudbase_cms',
  'cloudbase_agent', 'cloudbase_mysql', 'cloudbase_auth',
]
assert.ok(Array.isArray(catalog.providerProfiles), '缺少首批 Provider 配置档案')
for (const providerCode of requiredProviders) {
  const profile = catalog.providerProfiles.find((item) => item.providerCode === providerCode)
  assert.ok(profile, `缺少 Provider 配置档案：${providerCode}`)
  for (const field of [
    'chineseName', 'owner', 'capabilityCodes', 'status', 'endpointProfile', 'credentialRef',
    'connectTimeoutMs', 'readTimeoutMs', 'totalDeadlineMs', 'maxAttempts', 'backoffPolicy',
    'rateLimitPolicy', 'circuitBreakerPolicy', 'costPolicy', 'monthlyBudgetCny',
    'warningThresholdCny', 'fallbackChain', 'outputContractVersion', 'auditRetentionDays',
    'releaseVersion', 'releaseSha256', 'effectiveAt', 'expiresAt', 'releaseStatus',
    'fallback', 'blockingScope', 'sourceRefs',
  ]) { assert.ok(profile[field] !== undefined, `${providerCode} 缺少字段 ${field}`) }
  assert.equal(profile.decisionGroup, 'provider_runtime', `${providerCode} 未进入 Provider 配置化裁决组`)
  for (const sourceRef of profile.sourceRefs) {
    assertSourceRefResolvable(sourceRef, providerCode)
  }
  assert.ok(catalogReadme.includes(`\`${providerCode}\``), `中文阅读版缺少 Provider：${providerCode}`)
}

const bailianDiagnosisProfile = catalog.providerProfiles.find(
  (item) => item.providerCode === 'bailian_qwen_diagnosis'
)
const bailianEnrichmentProfile = catalog.providerProfiles.find(
  (item) => item.providerCode === 'bailian_qwen_enrichment'
)
assert.equal(bailianDiagnosisProfile?.modelCode, 'qwen3.5-flash-2026-02-23')
assert.equal(bailianDiagnosisProfile?.resultSchemaVersion, 'diagnosis-model-output/v1')
assert.equal(
  bailianDiagnosisProfile?.promptReleaseSha256,
  '11c58cebe3b3c41097d6f6d6b3c5b5d7eb16248e4f07bacd497868a647ccc964'
)
assert.equal(bailianEnrichmentProfile?.modelCode, 'qwen3.5-flash-2026-02-23')
assert.equal(bailianEnrichmentProfile?.resultSchemaVersion, 'plant-encyclopedia-display/v1')

const requiredVariable = (id: string): ConfigurationVariable => {
  const variable = catalog.variables.find((item) => item.id === id)
  assert.ok(variable, `关键变量不存在：${id}`)
  return variable
}
// Expected 来源更新：用户 2026-10-08 裁决游客令牌有效期 7 天（168 小时）。
assert.equal(requiredVariable('identity.guest.session_ttl_hours').allowed, '168')
assert.equal(requiredVariable('plant-knowledge.enrichment.worker_concurrency').currentValue, 1)
assert.equal(requiredVariable('plant-knowledge.enrichment.max_attempts').currentValue, 3)
assert.equal(requiredVariable('plant-knowledge.enrichment.monthly_budget_cny').currentValue, 0)
assert.deepEqual(requiredVariable('plant-knowledge.taxonomy.authority_allowlist').currentValue, ['POWO', 'WCVP', 'WFO', 'RHS_ICRA'])
assert.deepEqual(requiredVariable('plant-knowledge.taxonomy.authority_priority').currentValue, {
  primaryClassification: ['POWO', 'WCVP'],
  crossCheck: ['WFO'],
  cultivarAuthority: ['RHS_ICRA'],
  conflictResolution: 'QUARANTINE_AND_HUMAN_REVIEW',
})
assert.equal(requiredVariable('provider.bailian.model_code').status, 'confirmed')
assert.equal(
  requiredVariable('provider.bailian.model_code').currentValue,
  'qwen3.5-flash-2026-02-23'
)
assert.equal(
  requiredVariable('plant-knowledge.cms.content_schema_version').currentValue,
  'plant-encyclopedia-display/v1'
)
assert.equal(
  requiredVariable('diagnosis.result.schema_version').currentValue,
  'diagnosis-model-output/v1'
)
assert.equal(
  requiredVariable('diagnosis.prompt.release_sha256').currentValue,
  '11c58cebe3b3c41097d6f6d6b3c5b5d7eb16248e4f07bacd497868a647ccc964'
)

// Expected 来源：user-plant/v1“最低档案”章节。该规则决定首株有效档案奖励，
// 不依赖第三方 Provider 或历史实现，因此必须在 P1 作为不可变策略值冻结。
assert.equal(requiredVariable('user-plant.profile.minimum_completeness').status, 'confirmed')
assert.deepEqual(requiredVariable('user-plant.profile.minimum_completeness').currentValue, {
  profileVersion: 'user-plant-profile/v1',
  requiredFields: [
    'identityStatus',
    'pot',
    'location',
    'lightingEnvironment',
    'ventilationEnvironment',
  ],
  acceptedIdentityStates: ['unidentified', 'candidate_pending', 'confirmed'],
  rewardOncePerUser: true,
})

// Expected 来源：principal-and-capability/v1 与已确认的三类生成式产品动作。
// “所有付费能力”必须展开成白名单，绝不能用通配符在运行时放权。
assert.equal(requiredVariable('subscription.capability.catalog').status, 'confirmed')
assert.deepEqual(requiredVariable('subscription.capability.catalog').currentValue, {
  catalogVersion: 'subscription-capability-catalog/v1',
  capabilities: [
    { code: 'PLANT_IDENTIFICATION', tiers: ['guest', 'free', 'trial', 'member'], consumesAiPoints: false, scope: 'public' },
    { code: 'FIXED_DIAGNOSIS', tiers: ['guest', 'free', 'trial', 'member'], consumesAiPoints: false, scope: 'public' },
    { code: 'INDEPENDENT_WATERING', tiers: ['guest', 'free', 'trial', 'member'], consumesAiPoints: false, scope: 'public' },
    { code: 'SOIL_VISUAL_EVIDENCE', tiers: ['guest', 'free', 'trial', 'member'], consumesAiPoints: false, scope: 'public' },
    { code: 'USER_PLANT_CREATE', tiers: ['free', 'trial', 'member'], consumesAiPoints: false, scope: 'user_plant' },
    { code: 'POINTS_LEVEL_QUERY', tiers: ['free', 'trial', 'member'], consumesAiPoints: false, scope: 'user' },
    { code: 'REWARDED_AI', tiers: ['free', 'trial', 'member'], consumesAiPoints: true, scope: 'reward_grant' },
    { code: 'USER_AGENT_TEXT', tiers: ['trial', 'member'], consumesAiPoints: true, scope: 'user' },
    { code: 'USER_DIAGNOSIS_TEXT', tiers: ['trial', 'member'], consumesAiPoints: true, scope: 'user_plant' },
    { code: 'USER_DIAGNOSIS_VISUAL', tiers: ['trial', 'member'], consumesAiPoints: true, scope: 'user_plant' },
  ],
  unknownCapabilityPolicy: 'deny',
})

// Expected 来源：configuration-provider-architecture/v1 与 http-api/v1。
// 这些是本地 Foundation 必须先冻结的运行护栏，不依赖供应商账户的业务统计。
for (const [id, value] of [
  ['configuration.last_known_good.max_age_seconds', 300],
  ['configuration.emergency_switch.max_ttl_minutes', 240],
  ['configuration.cache.ttl_seconds', 30],
  ['configuration.snapshot.retention_days', 365],
  ['configuration.rollback.allowed_window_hours', 24],
  ['http.idempotency.retention_hours', 168],
] as const) {
  assert.equal(requiredVariable(id).status, 'confirmed', `${id} 必须在 P1 冻结`)
  assert.equal(requiredVariable(id).currentValue, value, `${id} 冻结值不一致`)
}
assert.deepEqual(requiredVariable('configuration.release.approval_policy').currentValue, {
  standard: { requiredOwnerApprovals: 1, explicitUserApproval: false },
  highRisk: { requiredOwnerApprovals: 1, explicitUserApproval: true },
  emergencyDisable: { requiredOwnerApprovals: 1, explicitUserApproval: false, maxTtlMinutes: 240 },
})
assert.deepEqual(requiredVariable('http.internal_body_limit_bytes').currentValue, {
  agentApi: 262144,
  jobApi: 262144,
  callbackApi: 262144,
})
assert.equal(
  requiredVariable('deployment.cloudbase.credential_resolver_ref').currentValue,
  'cloudbase-runtime-credential-resolver/v1'
)

// P1 退出只要求“P1 实现依赖项”冻结。后续业务运行参数仍可 pending，
// 但必须改挂到真正实现/真实集成阶段，不能伪装为 P1 已完成。
assert.deepEqual(
  catalog.variables
    .filter((variable) => variable.status === 'pending' && variable.phase === 'P1')
    .map((variable) => variable.id),
  []
)

for (const [title, binding] of Object.entries(catalog.ticketBindings)) {
  // 已读回的 E01 新票为 z8v0kmtktd；票据前缀不代表产品合同或 Phase。
  assert.match(binding.id, /^[a-z0-9]+$/, `${title} 的 ClickUp ID 不合法`)
  // ClickUp 同时支持带 workspace 数字段和省略该段的任务直链，两者都必须精确指向同一任务 ID。
  assert.match(binding.url, /^https:\/\/app\.clickup\.com\/t\/(?:\d+\/)?[a-z0-9]+$/, `${title} 的 ClickUp URL 格式不合法`)
  assert.equal(new URL(binding.url).pathname.split('/').at(-1), binding.id, `${title} 的 ClickUp URL 与 ID 不一致`)
  assert.ok(Array.isArray(binding.agents) && binding.agents.length > 0, `${title} 缺少负责 agent`)
}

for (const term of ['BusinessPolicyRelease', 'ProviderRegistry', 'PolicyRegistry', 'ConfigSnapshot', 'CredentialStore']) {
  assert.ok(files.readme.includes(term), `README 架构图缺少节点：${term}`)
  assert.ok(files.plan.includes(term), `Master Plan 架构图缺少节点：${term}`)
}

for (const [name, content] of Object.entries(files)) {
  assert.ok(content.includes('不可配置') || content.includes('配置'), `${name} 未纳入配置治理`)
}
assert.ok(files.agents.includes('开发前置硬规则'), 'AGENTS.md 缺少开发前配置化裁决硬规则')
assert.ok(files.agents.includes('收益明显大于'), 'AGENTS.md 缺少配置化收益与复杂度判定')

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
  version: string
  files: Record<string, string>
}
assert.equal(manifest.version, 'backend-architecture/v2-config-2')
assert.equal(manifest.files['configuration-and-providers.md'], createHash('sha256').update(contract).digest('hex'))
assert.equal(manifest.files['configuration-variable-catalog.json'], createHash('sha256').update(catalogRaw).digest('hex'))
assert.equal(manifest.files['README.md'], createHash('sha256').update(files.readme).digest('hex'))

})
