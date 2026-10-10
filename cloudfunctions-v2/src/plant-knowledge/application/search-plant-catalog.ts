import type { IncomingMessage } from 'node:http'
import Ajv, { type JSONSchemaType } from 'ajv'
import { RUNTIME_PARAMETERS } from '../../configuration/runtime-parameters.js'
import { createNodeRequestChainHandler } from '../../foundation/http/node-request-chain-handler.js'
import {
  PublicRequestError,
  type RequestChainAuditEvent
} from '../../foundation/http/request-chain.js'
import type { RouteHandler } from '../../foundation/http/route-dispatcher.js'

/** 冻结目录查询；这些边界是接口硬规则，不由运营配置覆盖。 */
export type PlantCatalogQuery = {
  /** 裁剪首尾空白并做 NFC 规范化后的 1 至 64 个 Unicode 码点。 */
  readonly q: string
  /** 请求条数；省略时为 10，允许 1 至 20 的整数。 */
  readonly limit: number
}
/** 目录公开项；目录引用与内部植物身份分属不同命名空间。 */
export type PlantCatalogItem = {
  /** 来源目录的分类引用，不是数据库自增主键。 */
  readonly catalogTaxonRef: string
  /** 目录首选展示名称。 */
  readonly displayName: string
  /** 目录原始学名，用于百科导航。 */
  readonly scientificName: string
  /** 来源分类级别；不强行收窄为内部身份枚举。 */
  readonly taxonRank: string
  /** 来源目录中的分类状态，不代表内部身份准入状态。 */
  readonly taxonomicStatus: string
  /** 来源目录是否允许用户选择；不表示内部身份准入。 */
  readonly selectable: boolean
  /** 是否已有 SQL 百科内容。 */
  readonly hasEncyclopedia: boolean
  /** 是否已有封面资料；图片展示仍须遵守许可。 */
  readonly hasImage: boolean
  /** 仅在有效、唯一且当前已发布时附带的内部身份公开引用。 */
  readonly plantIdentityRef?: string
}
/** 目录结果信封，不提供分页游标。 */
export type PlantCatalogResult = {
  /** 按冻结合同稳定排序并截断后的项目。 */
  readonly items: readonly PlantCatalogItem[]
  /** 存在超过请求条数的匹配文档。 */
  readonly truncated: boolean
}
/** 公开只读用例依赖；SQL 只能经 Repository 访问。 */
export type SearchPlantCatalogDependencies = {
  /** 查询目录投影，不实时请求 Tropicals。 */
  readonly searchPlantCatalog: (query: PlantCatalogQuery) => Promise<PlantCatalogResult>
  /** 只接收脱敏请求结果的审计端口。 */
  readonly writeAudit: (event: RequestChainAuditEvent) => void | Promise<void>
}
/** 目录搜索边界（全部为硬规则，取值见代码层注册表）：关键词码点上限、limit 默认 / 最小 / 最大。 */
const catalogLimits = {
  queryMaxCodePoints: RUNTIME_PARAMETERS.plantKnowledge.searchQueryMaxCodePoints.value,
  defaultLimit: RUNTIME_PARAMETERS.plantKnowledge.catalogDefaultLimit.value,
  minimumLimit: RUNTIME_PARAMETERS.plantKnowledge.catalogMinimumLimit.value,
  maximumLimit: RUNTIME_PARAMETERS.plantKnowledge.searchResultMaxItems.value
}
const schema: JSONSchemaType<PlantCatalogQuery> = {
  type: 'object',
  additionalProperties: false,
  required: ['q', 'limit'],
  properties: {
    q: { type: 'string', minLength: 1, maxLength: catalogLimits.queryMaxCodePoints },
    limit: { type: 'integer', minimum: catalogLimits.minimumLimit, maximum: catalogLimits.maximumLimit }
  }
}
const validate = new Ajv({ allErrors: true }).compile(schema)
const publicReason = '目录搜索为公开非个性化读取，不解析用户或平台主体'

/** 缺 q 留给 DTO 拒绝；仅省略 limit 使用冻结默认值，空值与非十进制整数均拒绝。 */
function readQuery(request: IncomingMessage): Record<string, unknown> {
  request.resume()
  const parameters = new URL(request.url ?? '/', 'http://127.0.0.1').searchParams
  const q = parameters.get('q')
  const limit = parameters.get('limit')
  return {
    q: q?.trim().normalize('NFC'),
    limit: limit === null ? catalogLimits.defaultLimit : /^\d+$/u.test(limit) ? Number(limit) : undefined
  }
}
/** 创建目录公开 GET；权限步骤显式不适用，其余步骤沿用固定请求链。 */
export function createSearchPlantCatalogRouteHandler(
  dependencies: SearchPlantCatalogDependencies
): RouteHandler {
  const handler = createNodeRequestChainHandler<
    Record<string, unknown>,
    undefined,
    undefined,
    PlantCatalogQuery,
    PlantCatalogQuery,
    PlantCatalogQuery,
    PlantCatalogResult,
    PlantCatalogResult
  >({
    requestLimits: { kind: 'execute', run: readQuery },
    identityValidate: { kind: 'not_applicable', reason: publicReason },
    principalResolve: { kind: 'not_applicable', reason: publicReason },
    objectOwnership: { kind: 'not_applicable', reason: '目录投影不包含用户数据' },
    dtoValidate: {
      kind: 'execute',
      run: input => {
        if (!validate(input)) {
          throw new PublicRequestError(400, 'VALIDATION_FAILED', '请求参数不合法')
        }
        return input
      }
    },
    buildCommand: { kind: 'execute', run: ({ dto }) => dto },
    domainRule: { kind: 'execute', run: ({ command }) => command },
    transactionPersistence: {
      kind: 'execute',
      run: ({ domainDecision }) => dependencies.searchPlantCatalog(domainDecision)
    },
    publicResponse: { kind: 'execute', run: result => result },
    writeAudit: dependencies.writeAudit
  })
  return (request, response) => handler(request, response)
}
