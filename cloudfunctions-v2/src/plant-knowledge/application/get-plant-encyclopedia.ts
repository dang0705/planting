import Ajv, { type JSONSchemaType } from 'ajv'
import { RUNTIME_PARAMETERS } from '../../configuration/runtime-parameters.js'
import type { PlantKnowledgePublicSearchRules } from '../../configuration/business-policies/index.js'
import { createNodeRequestChainHandler } from '../../foundation/http/node-request-chain-handler.js'
import { requirePolicy, type PolicyRulesPort } from '../../foundation/policy/require-policy.js'
import {
  PublicRequestError,
  type RequestChainAuditEvent
} from '../../foundation/http/request-chain.js'
import type { RouteHandler } from '../../foundation/http/route-dispatcher.js'
import type { TropicalsCoverImage } from '../domain/tropicals-cover-image.js'

/** 百科定位 DTO；分类引用与路径 slug 必须共同提供，不能混用内部身份。 */
export type PlantEncyclopediaQuery = {
  /** 由学名生成的展示路径，不要求全局唯一。 */
  readonly scientificNameSlug: string
  /** 精确定位目录与来源百科的外部分类引用。 */
  readonly catalogTaxonRef: string
}
/** 百科展示 DTO；全部内容只用于展示，不能作为养护或诊断知识。 */
export type PlantEncyclopediaResponse = {
  /** 来源目录分类引用，非数据库主键。 */
  readonly catalogTaxonRef: string
  /** 服务端按来源学名生成并已核对的 slug。 */
  readonly scientificNameSlug: string
  /** 来源百科中的非空展示名称。 */
  readonly displayName: string
  /** 来源百科中的非空科学名称。 */
  readonly scientificName: string
  /** 来源提供的名称别名，不能确认内部身份。 */
  readonly additionalNames: readonly string[]
  /** 来源分类展示信息，未知列保留为 null。 */
  readonly taxonomy: Readonly<Record<'rank' | 'order' | 'family' | 'genus', string | null>>
  /** 来源简介，未提供时保留 null。 */
  readonly description: string | null
  /** 七段百科展示正文，不能传入内部模型。 */
  readonly sections: Readonly<
    Record<
      | 'morphology'
      | 'distribution'
      | 'varieties'
      | 'habitat'
      | 'propagation'
      | 'commercial'
      | 'pests',
      string | null
    >
  >
  /** 养护相关展示文字，不是内部养护建议或策略。 */
  readonly careDisplay: Readonly<
    Record<'difficulty' | 'temperatureRange' | 'humidityRange' | 'lightRequirement', string | null>
  >
  /** 封面图（完整地址 + 逐图来源）；无封面或引用不可公开时为 null（plant-encyclopedia-read/v2）。 */
  readonly coverImage: TropicalsCoverImage | null
  /** 文本来源署名与授权链接，不推定图片许可。 */
  readonly attribution: {
    /** 文本来源方的正式署名。 */
    readonly name: string
    /** 当前来源公开数据集页面。 */
    readonly sourceUrl: string
    /** 文本 CC BY 4.0 授权说明。 */
    readonly licenseUrl: string
  }
}
/** 百科用例依赖；数据库边界由只读 Repository 提供。 */
export type GetPlantEncyclopediaDependencies = {
  /** 精确定位百科并执行展示白名单，不自动确认身份。 */
  readonly getPlantEncyclopedia: (
    query: PlantEncyclopediaQuery
  ) => Promise<PlantEncyclopediaResponse | null>
  /** 固定请求链的脱敏结果审计。 */
  readonly writeAudit: (event: RequestChainAuditEvent) => void | Promise<void>
  /** 读取公开搜索策略快照（引用最大码点数）；null 时 503。 */
  readonly readPublicSearchRules: PolicyRulesPort<PlantKnowledgePublicSearchRules>
}
/** 分类引用与 slug 的代码绝对上限（= catalog_taxon_ref VARCHAR(512)）；实际上限来自策略快照，只能更小。 */
const referenceMaxCodePoints =
  RUNTIME_PARAMETERS.policyBounds.plantKnowledgePublicSearch.value
    .encyclopediaReferenceMaxCodePoints
const querySchema: JSONSchemaType<PlantEncyclopediaQuery> = {
  type: 'object',
  additionalProperties: false,
  required: ['scientificNameSlug', 'catalogTaxonRef'],
  properties: {
    scientificNameSlug: { type: 'string', minLength: 1, maxLength: referenceMaxCodePoints },
    catalogTaxonRef: { type: 'string', minLength: 1, maxLength: referenceMaxCodePoints }
  }
}
const validate = new Ajv({ allErrors: true }).compile(querySchema)
const publicReason = '公开 SQL 百科只读，不解析用户或平台身份'

/** 创建已登记的公开百科路由；有数据后核对 slug，不修改来源或同步任务。 */
export function createGetPlantEncyclopediaRouteHandler(
  dependencies: GetPlantEncyclopediaDependencies
): RouteHandler {
  return (request, response, pathParameters) =>
    createNodeRequestChainHandler<
      Record<string, unknown>,
      undefined,
      undefined,
      PlantEncyclopediaQuery,
      PlantEncyclopediaQuery,
      PlantEncyclopediaQuery,
      PlantEncyclopediaResponse | null,
      PlantEncyclopediaResponse
    >({
      requestLimits: {
        kind: 'execute',
        run: raw => {
          raw.resume()
          return {
            ...pathParameters,
            catalogTaxonRef: new URL(raw.url ?? '/', 'http://127.0.0.1').searchParams.get(
              'catalogTaxonRef'
            )
          }
        }
      },
      identityValidate: { kind: 'not_applicable', reason: publicReason },
      principalResolve: { kind: 'not_applicable', reason: publicReason },
      objectOwnership: { kind: 'not_applicable', reason: '百科展示不包含用户数据' },
      dtoValidate: {
        kind: 'execute',
        run: async input => {
          const rules = await requirePolicy(dependencies.readPublicSearchRules)
          if (
            !validate(input) ||
            [...input.scientificNameSlug].length > rules.encyclopediaReferenceMaxCodePoints ||
            [...input.catalogTaxonRef].length > rules.encyclopediaReferenceMaxCodePoints
          ) {
            throw new PublicRequestError(400, 'VALIDATION_FAILED', '请求参数不合法')
          }
          return input
        }
      },
      buildCommand: { kind: 'execute', run: ({ dto }) => dto },
      domainRule: { kind: 'execute', run: ({ command }) => command },
      transactionPersistence: {
        kind: 'execute',
        run: ({ domainDecision }) => dependencies.getPlantEncyclopedia(domainDecision)
      },
      publicResponse: {
        kind: 'execute',
        run: result => {
          if (!result) {
            throw new PublicRequestError(404, 'NOT_FOUND', '植物百科不存在')
          }
          return result
        }
      },
      writeAudit: dependencies.writeAudit
    })(request, response)
}
