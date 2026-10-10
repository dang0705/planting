import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { BUSINESS_POLICY_DEFINITIONS, findBusinessPolicyDefinition } from '../../src/configuration/business-policies/index.js'
import { loadPolicyReleaseDocument } from '../../src/configuration/policy-release/release-document.js'
import { renderPolicySeedSql } from '../../src/configuration/policy-release/policy-release-store.js'
import { RUNTIME_PARAMETERS } from '../../src/configuration/runtime-parameters.js'
import { calculateCanonicalJsonSha256, type CanonicalJsonValue } from '../../src/foundation/json/canonical-json-sha256.js'
import { findProjectRoot } from '../support/project-root.js'

/**
 * L1 / unit_real_data（读取真实配置目录、真实 v1 发布文档与种子 SQL 文件）。
 * Expected 来源：配置目录 `configuration-variable-catalog.json`（用户 2026-10-10 裁定：业务参数迁入策略发布、取值不变；
 * 每项 `policyRelease` 指向策略字段与 v1 发布文件；`*.absolute_bounds` 为代码硬边界）与设计说明 configuration-layers.md v2 §3、§6。
 * 下方逐项硬编码的冻结值抄自目录当前值，用于防止发布文档与目录被同时误改。
 * 未覆盖：真实数据库读取（见 mysql 用例）。
 */
const root = findProjectRoot()
type CatalogVariable = { id: string; layer: string; status: string; currentValue: unknown; configurationTier: string;
  policyRelease?: { domainCode: string; policyCode: string; schemaVersion: string; field: string; v1ReleaseFile: string; absoluteBoundsKey: string } }
const catalog = JSON.parse(readFileSync(join(root, 'docs/backend-v2/architecture/configuration-variable-catalog.json'), 'utf8')) as { variables: CatalogVariable[] }
const variable = (id: string) => catalog.variables.find(item => item.id === id)
const readRepoFile = (relativePath: string) => readFileSync(join(root, relativePath), 'utf8')
const releaseFiles = [
  'cloudfunctions-v2/models/policy-releases/care.long_term_rules.v1.release.json',
  'cloudfunctions-v2/models/policy-releases/care.mvp_watering.v4.release.json',
  'cloudfunctions-v2/models/policy-releases/user-plant.list_rules.v1.release.json',
  'cloudfunctions-v2/models/policy-releases/user-plant.asset_rules.v1.release.json',
  'cloudfunctions-v2/models/policy-releases/plant-knowledge.public_search.v1.release.json',
  'cloudfunctions-v2/models/policy-releases/weather.public_read.v1.release.json',
  'cloudfunctions-v2/models/policy-releases/http.request_write.v2.release.json',
]
const load = (file: string) => {
  const result = loadPolicyReleaseDocument(JSON.parse(readRepoFile(file)), readRepoFile)
  if (!result.ok) { throw new Error(`${file} 校验失败：${result.reason}`) }
  return result
}

describe('策略 v1 发布文档与配置目录一致', () => {
  it('目录中每个 policyRelease 字段的取值等于发布正文字段，且该项已为 confirmed 的 policy 层', () => {
    const migrated = catalog.variables.filter(item => item.policyRelease !== undefined)
    expect(migrated.length).toBeGreaterThanOrEqual(20)
    for (const item of migrated) {
      const target = item.policyRelease!
      expect([item.layer, item.status, item.configurationTier], item.id).toEqual(['domain_policy', 'confirmed', 'policy'])
      const releaseFile = target.v1ReleaseFile.endsWith('.release.json') ? target.v1ReleaseFile
        : `cloudfunctions-v2/models/policy-releases/${target.domainCode}.${target.policyCode}.${target.schemaVersion.split('/').at(-1)}.release.json`
      const loaded = load(releaseFile)
      expect([loaded.document.domainCode, loaded.document.policyCode, loaded.document.schemaVersion], item.id)
        .toEqual([target.domainCode, target.policyCode, target.schemaVersion])
      expect((loaded.policy as Record<string, unknown>)[target.field], item.id).toEqual(item.currentValue)
    }
  })

  it('冻结值（独立 Expected，抄自目录，取值不变）', () => {
    const value = (id: string) => variable(id)?.currentValue
    expect({
      expiry: value('care.plans.expiry_grace_hours'), backfill: value('care.facts.watering_backfill_max_days'), postpone: value('care.plans.check_max_postpone_days'),
      proposal: value('care.watering.open_window_proposal_valid_hours'), carePage: value('care.plans.page_size'), gap: value('care.watering.drying_gap_fill_max_hours'),
      ppfdPerGhi: value('care.watering.plant_light_max_ppfd_per_ghi'), indoorWindow: value('care.watering.indoor_climate_window_hours'),
      plantPage: value('user-plant.list.page_size'), timelinePage: value('user-plant.timeline.page_size'), cleanup: value('user-plant.assets.replaced_cover_cleanup_days'),
      mime: value('storage.upload.allowed_mime_types'), bytes: value('storage.upload.max_image_bytes'), query: value('plant-knowledge.search.query_max_code_points'),
      result: value('plant-knowledge.search.result_max_items'), catalogDefault: value('plant-knowledge.catalog.default_limit'),
      reference: value('plant-knowledge.encyclopedia.reference_max_code_points'), topMax: value('weather.city_climate.recommend_top_max'),
      topDefault: value('weather.city_climate.recommend_top_default'), retention: value('http.idempotency.retention_hours')
    }).toEqual({
      expiry: 72, backfill: 7, postpone: 7, proposal: 24, carePage: { default: 20, max: 50 }, gap: 6, ppfdPerGhi: 2.3, indoorWindow: 24,
      plantPage: { default: 20, max: 50 }, timelinePage: { default: 20, max: 50 }, cleanup: 7, mime: ['image/jpeg', 'image/png', 'image/webp'], bytes: 5_242_880,
      query: 64, result: 20, catalogDefault: 10, reference: 512, topMax: 50, topDefault: 10, retention: 168
    })
  })

  it('每份发布文档都能被对应策略类型解析，摘要为正文的规范 JSON SHA-256', () => {
    for (const file of releaseFiles) {
      const loaded = load(file)
      const definition = findBusinessPolicyDefinition(loaded.document.domainCode, loaded.document.policyCode)
      expect(definition, file).not.toBeNull()
      expect(definition!.schemaVersions, file).toContain(loaded.document.schemaVersion)
      expect(definition!.resolve(loaded.policy, loaded.document.schemaVersion), file).not.toBeNull()
      expect(loaded.contentSha256, file).toBe(calculateCanonicalJsonSha256(loaded.policy as CanonicalJsonValue))
    }
  })

  it('策略类型清单覆盖全部新增策略（含浇水 v4 与 HTTP 写入 v2）', () => {
    const keys = BUSINESS_POLICY_DEFINITIONS.map(definition => `${definition.domainCode}/${definition.policyCode}`)
    expect(keys).toEqual(expect.arrayContaining(['care/long_term_rules', 'care/mvp_watering', 'user-plant/list_rules', 'user-plant/asset_rules',
      'plant-knowledge/public_search', 'weather/public_read', 'http/request_write']))
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('代码层绝对边界与目录 *.absolute_bounds 完全一致', () => {
    const bounds = RUNTIME_PARAMETERS.policyBounds
    expect(bounds.careLongTermRules.value).toEqual(variable('care.long_term_rules.absolute_bounds')?.currentValue)
    expect(bounds.careWateringRuntime.value).toEqual(variable('care.watering.runtime_absolute_bounds')?.currentValue)
    expect(bounds.plantKnowledgePublicSearch.value).toEqual(variable('plant-knowledge.public_search.absolute_bounds')?.currentValue)
    expect(bounds.weatherPublicRead.value).toEqual(variable('weather.public_read.absolute_bounds')?.currentValue)
    expect(bounds.userPlantListRules.value).toEqual(variable('user-plant.list_rules.absolute_bounds')?.currentValue)
    expect(bounds.userPlantAssetRules.value).toEqual(variable('user-plant.asset_rules.absolute_bounds')?.currentValue)
    expect(bounds.httpRequestWrite.value).toEqual(variable('http.request_write.absolute_bounds')?.currentValue)
  })

  it('v1 种子 SQL 文件与 CLI 渲染结果逐字一致（只写文件、不执行）', () => {
    const documents = releaseFiles.map(load)
    const expected = renderPolicySeedSql(documents, { issuedAtMs: Date.parse('2026-10-10T00:00:00Z') })
    expect(readRepoFile('docs/backend-v2/schema/seeds/business_policy_releases.2026-10-10.sql')).toBe(expected)
  })
})

describe('策略取值越过代码硬边界时解析失败（不回退默认值）', () => {
  const body = (file: string) => structuredClone(load(file).policy) as Record<string, any>
  const resolve = (domainCode: string, policyCode: string, schemaVersion: string, policy: unknown) =>
    findBusinessPolicyDefinition(domainCode, policyCode)!.resolve(policy, schemaVersion)

  it.each([
    ['分页上限超过合同 50', (p: Record<string, any>) => { p.planPageSize = { default: 20, max: 51 } }],
    ['分页默认大于上限', (p: Record<string, any>) => { p.planPageSize = { default: 30, max: 20 } }],
    ['过期宽限 0 小时', (p: Record<string, any>) => { p.planExpiryGraceHours = 0 }],
    ['过期宽限超过 720 小时', (p: Record<string, any>) => { p.planExpiryGraceHours = 721 }],
    ['混入额外字段', (p: Record<string, any>) => { p.extra = 1 }],
  ])('care/long_term_rules：%s', (_name, mutate) => {
    const policy = body(releaseFiles[0]!)
    mutate(policy)
    expect(resolve('care', 'long_term_rules', 'care-long-term-rules/v1', policy)).toBeNull()
  })

  it('plant-knowledge/public_search：查询长度超过列长 255、结果上限超过 20、默认大于上限均失败', () => {
    for (const mutate of [(p: Record<string, any>) => { p.searchQueryMaxCodePoints = 256 }, (p: Record<string, any>) => { p.searchResultMaxItems = 21 },
      (p: Record<string, any>) => { p.catalogDefaultLimit = 21 }, (p: Record<string, any>) => { p.encyclopediaReferenceMaxCodePoints = 513 }]) {
      const policy = body(releaseFiles[4]!)
      mutate(policy)
      expect(resolve('plant-knowledge', 'public_search', 'plant-knowledge-public-search/v1', policy)).toBeNull()
    }
    const smaller = body(releaseFiles[4]!)
    smaller.searchQueryMaxCodePoints = 128
    expect(resolve('plant-knowledge', 'public_search', 'plant-knowledge-public-search/v1', smaller)).not.toBeNull()
  })

  it('user-plant/asset_rules：不支持的 MIME、空白名单、超过 10 MiB 均失败', () => {
    for (const mutate of [(p: Record<string, any>) => { p.allowedMimeTypes = ['image/gif'] }, (p: Record<string, any>) => { p.allowedMimeTypes = [] },
      (p: Record<string, any>) => { p.maxImageBytes = 10_485_761 }]) {
      const policy = body(releaseFiles[3]!)
      mutate(policy)
      expect(resolve('user-plant', 'asset_rules', 'user-plant-asset-rules/v1', policy)).toBeNull()
    }
  })

  it('http/request_write v2：保留期 23 / 721 小时失败；正文上限只能等于代码绝对值', () => {
    for (const mutate of [(p: Record<string, any>) => { p.idempotencyRetentionHours = 23 }, (p: Record<string, any>) => { p.idempotencyRetentionHours = 721 },
      (p: Record<string, any>) => { p.jsonBodyLimitBytes = 2_097_152 }]) {
      const policy = body(releaseFiles[6]!)
      mutate(policy)
      expect(resolve('http', 'request_write', 'http-request-write-policy/v2', policy)).toBeNull()
    }
  })

  it('weather/public_read 与 user-plant/list_rules：上限超过 50 失败', () => {
    const weather = body(releaseFiles[5]!)
    weather.recommendTopMax = 51
    expect(resolve('weather', 'public_read', 'weather-public-read/v1', weather)).toBeNull()
    const list = body(releaseFiles[2]!)
    list.timelinePageSize = { default: 20, max: 51 }
    expect(resolve('user-plant', 'list_rules', 'user-plant-list-rules/v1', list)).toBeNull()
  })

  it('care/mvp_watering v4：缺段补齐超过 24 小时失败', () => {
    const policy = body(releaseFiles[1]!)
    policy.dryingGapFillMaxHours = 25
    expect(resolve('care', 'mvp_watering', 'care-watering-mvp/v4', policy)).toBeNull()
  })
})
