import { RUNTIME_PARAMETERS } from '../runtime-parameters.js'
import { compilePolicySchema, freezePolicy, integerWithin, type TypedPolicyDefinition } from './typed-policy.js'

/**
 * 植物知识公开搜索策略（plant-knowledge / public_search，正文 `plant-knowledge-public-search/v1`）。
 * 用户 2026-10-10 裁定：查询长度、结果上限、目录默认条数、百科引用长度迁入策略发布，取值不变（64、20、10、512）；
 * 代码保留与数据库列长度 / 公开合同相等的绝对上限（`plant-knowledge.public_search.absolute_bounds`），策略只能在其内调小。
 */
export interface PlantKnowledgePublicSearchRules {
  /** 正文合同版本，固定 `plant-knowledge-public-search/v1`。 */
  readonly contractVersion: 'plant-knowledge-public-search/v1'
  /** 搜索关键词（NFC、去首尾空白后）的最大 Unicode 码点数；已发布身份搜索与目录搜索共用。 */
  readonly searchQueryMaxCodePoints: number
  /** 搜索单次最多返回条数（已发布身份搜索固定返回上限；目录搜索 limit 的最大值）。 */
  readonly searchResultMaxItems: number
  /** 目录搜索省略 limit 时的默认条数，不超过 searchResultMaxItems。 */
  readonly catalogDefaultLimit: number
  /** 百科读取的分类引用与 slug 最大 Unicode 码点数。 */
  readonly encyclopediaReferenceMaxCodePoints: number
}

const bounds = RUNTIME_PARAMETERS.policyBounds.plantKnowledgePublicSearch.value
const validate = compilePolicySchema<PlantKnowledgePublicSearchRules>({
  type: 'object', additionalProperties: false,
  required: ['contractVersion', 'searchQueryMaxCodePoints', 'searchResultMaxItems', 'catalogDefaultLimit', 'encyclopediaReferenceMaxCodePoints'],
  properties: {
    contractVersion: { const: 'plant-knowledge-public-search/v1' },
    searchQueryMaxCodePoints: integerWithin(1, bounds.searchQueryMaxCodePoints),
    searchResultMaxItems: integerWithin(bounds.catalogMinimumLimit, bounds.searchResultMaxItems),
    catalogDefaultLimit: integerWithin(bounds.catalogMinimumLimit, bounds.searchResultMaxItems),
    encyclopediaReferenceMaxCodePoints: integerWithin(1, bounds.encyclopediaReferenceMaxCodePoints),
  },
})

/** 策略定义：目录默认条数不得大于结果上限。 */
export const PLANT_KNOWLEDGE_PUBLIC_SEARCH_POLICY: TypedPolicyDefinition<PlantKnowledgePublicSearchRules> = Object.freeze({
  domainCode: 'plant-knowledge',
  policyCode: 'public_search',
  schemaVersions: Object.freeze(['plant-knowledge-public-search/v1']),
  resolve: (document: unknown, schemaVersion: string) => {
    if (schemaVersion !== 'plant-knowledge-public-search/v1' || !validate(document)) { return null }
    if (document.catalogDefaultLimit > document.searchResultMaxItems) { return null }
    return freezePolicy(structuredClone(document))
  },
})
