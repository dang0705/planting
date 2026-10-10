import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

import { RUNTIME_PARAMETERS, type RuntimeParameter } from '../../src/configuration/runtime-parameters.js'
import { findProjectRoot } from '../support/project-root.js'

/**
 * L1 / unit_real_data（扫描真实后端源码与真实配置目录，不执行业务代码）。
 * Expected 来源：设计说明 `configuration-layers.md` §2.2（领域文件不得再写死已迁移常量，只能从统一入口读取）、
 * §2.4（`process.env` 只出现在 environment.ts；入口只把 process.env 原样交给读取器）、§6（目录每项具备
 * configurationTier 与 codeLocations）。
 * 待迁移白名单：2026-10-10 user-plant 域与 care 浇水建议请求路由已迁移完毕，白名单清空（只允许缩小）。
 * 未覆盖：运行时行为（由各领域既有测试保证不变）。
 */
const projectRoot = findProjectRoot()
const backendRoot = join(projectRoot, 'cloudfunctions-v2')
const sourceRoot = join(backendRoot, 'src')

/** 递归收集产品 TypeScript 源码的相对路径（相对 cloudfunctions-v2）。 */
function collectSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const absolute = join(directory, entry.name)
    if (entry.isDirectory()) { return collectSources(absolute) }
    return entry.name.endsWith('.ts') ? [relative(backendRoot, absolute)] : []
  })
}
const sources = collectSources(sourceRoot)
const read = (path: string) => readFileSync(join(backendRoot, path), 'utf8')

/** 暂未迁移（另一代理并行修改中）的文件前缀；只允许缩小，不允许扩大。 */
const pendingMigrationPrefixes: readonly string[] = []
const isPending = (path: string) => pendingMigrationPrefixes.some(prefix => path.startsWith(prefix))

/** 已迁移文件：不得再出现的写死模式（同名常量或字面量）。 */
const migratedFiles: Record<string, readonly RegExp[]> = {
  'src/care/domain/care-plan-expiry-rules.ts': [/CARE_PLAN_EXPIRY_GRACE_HOURS\s*=\s*\d/u, /batchSize:\s*\d/u, /runBudgetFractionOfFunctionTimeout:\s*\d/u],
  'src/care/domain/care-outbox-dispatch-rules.ts': [/leaseSeconds:\s*\d/u, /batchSize:\s*\d/u, /maxAttempts:\s*\d/u],
  'src/care/domain/long-term-care-rules.ts': [/(WATERING_BACKFILL_MAX_DAYS|CHECK_MAX_POSTPONE_DAYS|OPEN_WINDOW_PROPOSAL_VALID_HOURS)\s*=\s*\d/u, /default:\s*20/u],
  'src/care/watering/fill-mvp-drying-gaps.ts': [/MVP_DRYING_GAP_FILL_MAX_HOURS\s*=\s*\d/u],
  'src/care/provider/open-meteo-radiation-client.ts': [/integerWithin\([^)]*,\s*0,\s*(92|16)\)/u],
  'src/entries/care.ts': [/DeadlineMs\s*=\s*\d/u],
  'src/entries/identity.ts': [/totalDeadlineMs:\s*\d/u],
  'src/identity/provider/platform-login-dispatcher.ts': [/DeadlineMs\s*=\s*\d/u],
  'src/identity/provider/wechat-login-verifier.ts': [/DeadlineMs\s*=\s*\d/u],
  'src/identity/http/user-trial-anchor-route.ts': [/(clockSkewMs|nonceRetentionMs)\s*=\s*\d/u],
  'src/plant-knowledge/application/search-published-plants.ts': [/maximumQueryCodePoints\s*=\s*\d/u],
  'src/plant-knowledge/repository/mysql-published-plant-search-repository.ts': [/maximumSearchResultItems\s*=\s*\d/u],
  'src/plant-knowledge/application/search-plant-catalog.ts': [/maximum:\s*20/u, /minimum:\s*1\b/u, /maxLength:\s*64/u, /\?\s*10\s*:/u],
  'src/plant-knowledge/application/get-plant-encyclopedia.ts': [/maxLength:\s*512/u],
  'src/entries/user-plant.ts': [/DeadlineMs\s*=\s*\d/u],
  'src/weather/application/city-climate-fit.ts': [/top:\s*\{[^}]*maximum:\s*50/u],
  'src/entries/care-outbox-dispatch.ts': [/(leaseSeconds|batchSize):\s*\d/u],
  'src/entries/care-plan-expiry.ts': [/batchSize:\s*\d/u],
  'src/user-plant/http/transition-user-plant-route.ts': [/bodyLimitBytes\s*=\s*\d/u, /idempotencyRetentionMs\s*=\s*\d/u],
  'src/user-plant/http/create-temporary-case-route.ts': [/jsonBodyLimitBytes\s*=\s*\d/u, /idempotencyRetentionMs\s*=\s*\d/u],
  'src/user-plant/http/create-user-plant-route.ts': [/jsonBodyLimitBytes\s*=\s*\d/u, /idempotencyRetentionMs\s*=\s*\d/u],
  'src/user-plant/http/claim-guest-plant-case-route.ts': [/jsonBodyLimitBytes\s*=\s*\d/u],
  'src/user-plant/domain/guest-claim-lease.ts': [/LEASE_MS\s*=\s*\d/u],
  'src/user-plant/domain/user-plant-list-query.ts': [/default:\s*20/u],
  'src/user-plant/domain/timeline.ts': [/default:\s*20/u],
  'src/user-plant/domain/cover-asset.ts': [/maxCountPerPlant:\s*\d/u, /maxImageBytes:\s*\d/u, /replacedCoverCleanupDays:\s*\d/u, /'image\/jpeg',\s*'image\/png'/u],
  'src/care/http/watering-advice-route.ts': [/jsonBodyLimitBytes\s*=\s*\d/u, /idempotencyRetentionMs\s*=\s*\d/u],
}

describe('统一配置入口：源码扫描', () => {
  it('已迁移文件不再写死同名常量，并从统一入口读取', () => {
    const violations: string[] = []
    for (const [path, patterns] of Object.entries(migratedFiles)) {
      const text = read(path)
      for (const pattern of patterns) { if (pattern.test(text)) { violations.push(`${path} 仍写死 ${pattern}`) } }
      if (!/configuration\/(runtime-parameters|environment)\.js'/u.test(text)) { violations.push(`${path} 未从统一入口读取`) }
    }
    expect(violations).toEqual([])
  })

  it('HTTP 正文上限与幂等保留期只在注册表定义（待迁移白名单除外）', () => {
    const shared = [/1_048_576|1048576/u, /168\s*\*\s*60\s*\*\s*60\s*\*\s*1000|604_800_000/u]
    const violations = sources
      .filter(path => !path.startsWith('src/configuration/') && !isPending(path))
      .filter(path => shared.some(pattern => pattern.test(read(path))))
    expect(violations).toEqual([])
  })

  it('process.env 只在 environment.ts 读取；入口只把 process.env 原样交给读取器', () => {
    const allowed = (path: string) => path === 'src/configuration/environment.ts' || path.startsWith('src/entries/') || path === 'src/server.ts'
    const outside = sources.filter(path => !allowed(path) && read(path).includes('process.env'))
    expect(outside).toEqual([])
    const propertyAccess = sources
      .filter(path => path.startsWith('src/entries/') || path === 'src/server.ts')
      .filter(path => /process\.env\s*(\.|\[|\?\.)/u.test(read(path)))
    expect(propertyAccess).toEqual([])
  })

  it('配置目录每项都标注所在层与代码位置；注册表引用项标为 code 并指向注册表', () => {
    const catalog = JSON.parse(read('../docs/backend-v2/architecture/configuration-variable-catalog.json')) as {
      variables: Array<{ id: string; layer: string; configurationTier?: string; codeLocations?: string[]; configurationTierNote?: string; environmentOverrides?: Array<{ field: string; environmentName: string; minimum: number; maximum: number; decidedAt: string }> }>
      providerProfiles: Array<{ providerCode: string; environmentOverrides?: Array<{ field: string; environmentName: string; minimum: number; maximum: number; decidedAt: string }> }>
    }
    const registryKeys = new Set(Object.values(RUNTIME_PARAMETERS).flatMap(group => Object.values(group as Record<string, RuntimeParameter<unknown>>))
      .flatMap(parameter => parameter.source.kind === 'catalog_variable' ? [parameter.source.catalogKey] : []))
    const problems: string[] = []
    for (const variable of catalog.variables) {
      if (!['code', 'env', 'policy', 'env_overridable'].includes(variable.configurationTier ?? '')) { problems.push(`${variable.id} 缺少 configurationTier`) }
      if (!Array.isArray(variable.codeLocations)) { problems.push(`${variable.id} 缺少 codeLocations`); continue }
      for (const location of variable.codeLocations) {
        if (!existsSync(join(projectRoot, location))) { problems.push(`${variable.id} 代码位置不存在：${location}`) }
      }
      const overridable = variable.configurationTier === 'env_overridable' && (variable.environmentOverrides?.length ?? 0) > 0
      if (variable.layer === 'hard_rule' && variable.configurationTier !== 'code' && !overridable) { problems.push(`${variable.id} 硬规则必须在 code 层`) }
      if (variable.layer === 'deployment_secret' && variable.configurationTier !== 'env') { problems.push(`${variable.id} 部署配置必须在 env 层`) }
      if (registryKeys.has(variable.id)) {
        if (!['code', 'env_overridable'].includes(variable.configurationTier ?? '')) { problems.push(`${variable.id} 已入注册表却未标 code`) }
        if (!variable.codeLocations.includes('cloudfunctions-v2/src/configuration/runtime-parameters.ts')) { problems.push(`${variable.id} 代码位置未指向注册表`) }
      }
    }
    expect(problems).toEqual([])
  })

  it('主代理 2026-10-10 裁定落入目录：env 覆盖白名单、8 项代码常量说明、weather top 上限硬规则', () => {
    const catalog = JSON.parse(read('../docs/backend-v2/architecture/configuration-variable-catalog.json')) as {
      variables: Array<Record<string, unknown> & { id: string }>
      providerProfiles: Array<Record<string, unknown> & { providerCode: string }>
    }
    const variable = (id: string) => catalog.variables.find(item => item.id === id)
    const overridesOf = (entry: Record<string, unknown> | undefined) =>
      (entry?.environmentOverrides as Array<Record<string, unknown>> | undefined)?.map(item => [item.field, item.environmentName, item.minimum, item.maximum, item.decidedAt])
    expect(variable('care.outbox_dispatch')?.configurationTier).toBe('env_overridable')
    expect(overridesOf(variable('care.outbox_dispatch'))).toEqual([
      ['leaseSeconds', 'V2_CARE_OUTBOX_LEASE_SECONDS', 10, 120, '2026-10-10'],
      ['batchSize', 'V2_CARE_OUTBOX_BATCH_SIZE', 20, 500, '2026-10-10']
    ])
    expect(variable('care.plans.expiry_scan')?.configurationTier).toBe('env_overridable')
    expect(overridesOf(variable('care.plans.expiry_scan'))).toEqual([['batchSize', 'V2_CARE_PLAN_EXPIRY_BATCH_SIZE', 100, 2000, '2026-10-10']])
    for (const [code, name, min, max] of [
      ['wechat_miniprogram_login', 'V2_WECHAT_LOGIN_TOTAL_DEADLINE_MS', 2000, 10_000],
      ['douyin_miniprogram_login', 'V2_DOUYIN_LOGIN_TOTAL_DEADLINE_MS', 2000, 10_000],
      ['open_meteo', 'V2_OPEN_METEO_TOTAL_DEADLINE_MS', 2000, 15_000],
      ['cloudbase_storage', 'V2_CLOUDBASE_STORAGE_TOTAL_DEADLINE_MS', 2000, 20_000]
    ] as const) {
      expect(overridesOf(catalog.providerProfiles.find(item => item.providerCode === code))).toEqual([['totalDeadlineMs', name, min, max, '2026-10-10']])
    }
    for (const id of ['care.outbox_dispatch', 'care.plans.expiry_scan', 'care.plans.expiry_grace_hours', 'care.watering.drying_gap_fill_max_hours', 'care.plans.page_size']) {
      expect(variable(id)?.status, `${id} 其余字段仍为硬规则`).toBe('hard_rule')
    }
    for (const id of ['http.json_body_limit_bytes', 'http.idempotency.retention_hours', 'identity.service_signature.clock_skew_seconds', 'identity.service_signature.nonce_ttl_seconds',
      'user-plant.assets.max_count_per_plant', 'user-plant.assets.replaced_cover_cleanup_days', 'storage.upload.allowed_mime_types', 'storage.upload.max_image_bytes']) {
      expect(variable(id)?.configurationTier, id).toBe('code')
      expect(String(variable(id)?.configurationTierNote ?? ''), id).toContain('将来如需运行时切换再升级为策略发布')
    }
    expect(variable('weather.city_climate.recommend_top_max')).toMatchObject({ layer: 'hard_rule', status: 'hard_rule', currentValue: 50, configurationTier: 'code' })
  })
})
