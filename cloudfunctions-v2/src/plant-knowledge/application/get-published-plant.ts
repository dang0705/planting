import Ajv, { type JSONSchemaType } from 'ajv'

import { createNodeRequestChainHandler } from '../../foundation/http/node-request-chain-handler.js'
import {
  PublicRequestError,
  type RequestChainAuditEvent
} from '../../foundation/http/request-chain.js'
import type { RouteHandler } from '../../foundation/http/route-dispatcher.js'
import type { PublishedPlantSqlRow } from '../repository/mysql-published-plant-repository.js'

/** 产品身份类型，取值与 002_plant_knowledge.sql 及 plant-knowledge-public-read/v1 一致。 */
export type PlantIdentityKind = 'taxon' | 'cultivar' | 'product_group'

/** 受控分类等级，取值与 plant-taxonomy/v1 可落库等级一致。 */
export type PublishedTaxonRank =
  | 'family'
  | 'genus'
  | 'species'
  | 'subspecies'
  | 'variety'
  | 'form'
  | 'hybrid'
  | 'cultivar'
  | 'species_group'

/** plant-knowledge-public-read/v1 §2 冻结的五字段公开视图。 */
export type PublishedPlantResponse = {
  /** 产品身份公开引用，不是数据库主键。 */
  readonly plantIdentityRef: string
  /** 中文一等公民展示名。 */
  readonly displayNameZh: string
  /** 产品身份类型：分类实体、栽培品种或产品组。 */
  readonly identityKind: PlantIdentityKind
  /** 主要权威分类实体接受学名（含作者串）。 */
  readonly acceptedScientificName: string
  /** 主要权威分类实体分类等级。 */
  readonly taxonRank: PublishedTaxonRank
}

/** 路径参数 DTO。 */
type PlantIdentityPathDto = {
  /** 产品身份公开引用，长度 8–100，只含字母、数字、下划线与连字符。 */
  plantIdentityRef: string
}

/** 读取用例依赖；数据库访问通过端口注入，便于在请求链中替换边界。 */
export type GetPublishedPlantDependencies = {
  /** 按公开可见谓词读取最小行；不可见时返回 null。 */
  readonly readPublishedPlant: (plantIdentityRef: string) => Promise<PublishedPlantSqlRow | null>
  /** 请求结束后的脱敏结果事件端口。 */
  readonly writeAudit: (event: RequestChainAuditEvent) => void | Promise<void>
}

const plantIdentityPathSchema: JSONSchemaType<PlantIdentityPathDto> = {
  type: 'object',
  additionalProperties: false,
  required: ['plantIdentityRef'],
  properties: {
    plantIdentityRef: {
      type: 'string',
      minLength: 8,
      maxLength: 100,
      pattern: '^[A-Za-z0-9_-]+$'
    }
  }
}

const validatePath = new Ajv({ allErrors: true }).compile(plantIdentityPathSchema)
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
const badRequestStatus = 400
const notFoundStatus = 404
const publicRouteReason = 'public 路由：http-api/v1 §2 规定只返回已发布非个性化内容，不解析任何主体'

/** 把最小行白名单映射为公开 DTO；枚举值越界视为数据损坏，由请求链降级为泛化 500。 */
function toPublicResponse(row: PublishedPlantSqlRow): PublishedPlantResponse {
  if (!identityKinds.has(row.identity_kind) || !taxonRanks.has(row.taxon_rank)) {
    throw new Error('已发布植物数据不符合公开读取合同')
  }
  return {
    plantIdentityRef: row.public_identity_ref,
    displayNameZh: row.display_name_zh,
    identityKind: row.identity_kind as PlantIdentityKind,
    acceptedScientificName: row.accepted_scientific_name,
    taxonRank: row.taxon_rank as PublishedTaxonRank
  }
}

/**
 * 创建 `GET /api/v2/plant-knowledge/plants/{plantIdentityRef}` 的处理器。
 * 身份三阶段按 public 级别声明不适用；可见性谓词在 Repository 内判定，领域阶段无额外规则。
 */
export function createGetPublishedPlantRouteHandler(
  dependencies: GetPublishedPlantDependencies
): RouteHandler {
  return (request, response, pathParameters) =>
    createNodeRequestChainHandler<
      PlantIdentityPathDto | Record<string, string>,
      undefined,
      undefined,
      PlantIdentityPathDto,
      string,
      string,
      PublishedPlantSqlRow,
      PublishedPlantResponse
    >({
      requestLimits: {
        kind: 'execute',
        run: rawRequest => {
          rawRequest.resume()
          return { ...pathParameters }
        }
      },
      identityValidate: { kind: 'not_applicable', reason: publicRouteReason },
      principalResolve: { kind: 'not_applicable', reason: publicRouteReason },
      objectOwnership: { kind: 'not_applicable', reason: '公开植物知识不属于任何用户或用户植物' },
      dtoValidate: {
        kind: 'execute',
        run: input => {
          if (!validatePath(input)) {
            throw new PublicRequestError(badRequestStatus, 'VALIDATION_FAILED', '请求参数不合法')
          }
          return input
        }
      },
      buildCommand: { kind: 'execute', run: ({ dto }) => dto.plantIdentityRef },
      domainRule: { kind: 'execute', run: ({ command }) => command },
      transactionPersistence: {
        kind: 'execute',
        run: async ({ domainDecision }) => {
          const row = await dependencies.readPublishedPlant(domainDecision)
          if (!row) {
            throw new PublicRequestError(notFoundStatus, 'NOT_FOUND', '植物不存在或尚未发布')
          }
          return row
        }
      },
      publicResponse: { kind: 'execute', run: toPublicResponse },
      writeAudit: dependencies.writeAudit
    })(request, response)
}
