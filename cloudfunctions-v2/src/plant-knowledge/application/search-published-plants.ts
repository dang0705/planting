import type { IncomingMessage } from 'node:http'

import Ajv, { type JSONSchemaType } from 'ajv'

import type { PlantKnowledgePublicSearchRules } from '../../configuration/business-policies/index.js'
import { requirePolicy, type PolicyRulesPort } from '../../foundation/policy/require-policy.js'
import { createNodeRequestChainHandler } from '../../foundation/http/node-request-chain-handler.js'
import {
  PublicRequestError,
  type RequestChainAuditEvent
} from '../../foundation/http/request-chain.js'
import type { RouteHandler } from '../../foundation/http/route-dispatcher.js'
import type { PublishedPlantSearchRepositoryResult } from '../repository/mysql-published-plant-search-repository.js'
import type { PublishedPlantSqlRow } from '../repository/mysql-published-plant-repository.js'
import {
  type PlantIdentityKind,
  type PublishedPlantResponse,
  type PublishedTaxonRank
} from './get-published-plant.js'

/** 已发布植物公开搜索查询 DTO；只接收一个规范化后的查询词。 */
type SearchPublishedPlantsQueryDto = {
  /** 去除首尾空白并转为 NFC 后的查询词。 */
  q: string
}

/** 已发布植物身份搜索响应；字段与 `plant-knowledge-public-search/v1` 一致。 */
type PublishedPlantSearchResponse = {
  /** 按冻结顺序返回的已发布身份五字段 DTO。 */
  readonly items: readonly PublishedPlantResponse[]
  /** 命中数超过公开固定上限时为 true。 */
  readonly truncated: boolean
}

/** 搜索用例的依赖；数据库查询由 Repository 注入，审计只接收脱敏事件。 */
export type SearchPublishedPlantsDependencies = {
  /** 读取当前双 active release 准入的身份匹配项（最多 maxItems 条）。 */
  readonly searchPublishedPlants: (
    query: string,
    maxItems: number
  ) => Promise<PublishedPlantSearchRepositoryResult>
  /** 读取公开搜索策略快照（plant-knowledge/public_search）；null 时 503。 */
  readonly readPublicSearchRules: PolicyRulesPort<PlantKnowledgePublicSearchRules>
  /** 请求完成后的脱敏结果事件端口。 */
  readonly writeAudit: (event: RequestChainAuditEvent) => void | Promise<void>
}

const badRequestStatus = 400
const publicRouteReason = 'public 路由：http-api/v1 §2 规定只返回已发布非个性化内容，不解析任何主体'

const searchQuerySchema: JSONSchemaType<SearchPublishedPlantsQueryDto> = {
  type: 'object',
  additionalProperties: false,
  required: ['q'],
  properties: {
    q: { type: 'string', minLength: 1 }
  }
}

const validateSearchQuery = new Ajv({ allErrors: true }).compile(searchQuerySchema)
const identityKinds: ReadonlySet<string> = new Set<PlantIdentityKind>([
  'taxon',
  'cultivar',
  'product_group'
])
const taxonRanks: ReadonlySet<string> = new Set<PublishedTaxonRank>([
  'family',
  'genus',
  'species',
  'subspecies',
  'variety',
  'form',
  'hybrid',
  'cultivar',
  'species_group'
])

/** 从公开 GET 请求提取并规范化 q；缺少 q 时保留空 DTO，由后续结构校验统一拒绝。 */
function readSearchQuery(request: IncomingMessage): Record<string, string> {
  request.resume()
  const parameters = new URL(request.url ?? '/', 'http://127.0.0.1').searchParams
  const query = parameters.get('q')
  return query === null ? {} : { q: query.trim().normalize('NFC') }
}

/** 把数据库最小行映射为公开 DTO；越界枚举按结构损坏失败关闭。 */
function toPublicPlantResponse(row: PublishedPlantSqlRow): PublishedPlantResponse {
  if (!identityKinds.has(row.identity_kind) || !taxonRanks.has(row.taxon_rank)) {
    throw new Error('已发布植物数据不符合公开搜索合同')
  }
  return {
    plantIdentityRef: row.public_identity_ref,
    displayNameZh: row.display_name_zh,
    identityKind: row.identity_kind as PlantIdentityKind,
    acceptedScientificName: row.accepted_scientific_name,
    taxonRank: row.taxon_rank as PublishedTaxonRank
  }
}

/** 把搜索结果白名单映射为搜索信封，不暴露发布或数据库内部字段。 */
function toPublicSearchResponse(
  result: PublishedPlantSearchRepositoryResult
): PublishedPlantSearchResponse {
  return {
    items: result.rows.map(toPublicPlantResponse),
    truncated: result.truncated
  }
}

/**
 * 创建 `GET /api/v2/plant-knowledge/search` 的处理器。
 * 搜索是公开只读查询，不解析身份、不读取用户数据；发布准入与字面匹配由 Repository 判定。
 */
export function createSearchPublishedPlantsRouteHandler(
  dependencies: SearchPublishedPlantsDependencies
): RouteHandler {
  return (request, response) =>
    createNodeRequestChainHandler<
      Record<string, string>,
      undefined,
      undefined,
      { readonly q: string; readonly maxItems: number },
      { readonly q: string; readonly maxItems: number },
      { readonly q: string; readonly maxItems: number },
      PublishedPlantSearchRepositoryResult,
      PublishedPlantSearchResponse
    >({
      requestLimits: { kind: 'execute', run: readSearchQuery },
      identityValidate: { kind: 'not_applicable', reason: publicRouteReason },
      principalResolve: { kind: 'not_applicable', reason: publicRouteReason },
      objectOwnership: { kind: 'not_applicable', reason: '公开植物知识不属于任何用户或用户植物' },
      dtoValidate: {
        kind: 'execute',
        // 查询长度上限与返回条数来自请求内锁定的公开搜索策略（用户 2026-10-10 裁定）；策略不可用 503，先于参数校验。
        run: async input => {
          const rules = await requirePolicy(dependencies.readPublicSearchRules)
          if (!validateSearchQuery(input) || [...input.q].length > rules.searchQueryMaxCodePoints) {
            throw new PublicRequestError(badRequestStatus, 'VALIDATION_FAILED', '请求参数不合法')
          }
          return { q: input.q, maxItems: rules.searchResultMaxItems }
        }
      },
      buildCommand: { kind: 'execute', run: ({ dto }) => dto },
      domainRule: { kind: 'execute', run: ({ command }) => command },
      transactionPersistence: {
        kind: 'execute',
        run: async ({ domainDecision }) =>
          dependencies.searchPublishedPlants(domainDecision.q, domainDecision.maxItems)
      },
      publicResponse: { kind: 'execute', run: toPublicSearchResponse },
      writeAudit: dependencies.writeAudit
    })(request, response)
}
