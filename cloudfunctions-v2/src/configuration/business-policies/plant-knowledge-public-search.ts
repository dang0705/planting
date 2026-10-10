import { RUNTIME_PARAMETERS } from '../runtime-parameters.js'
import {
  compilePolicySchema,
  freezePolicy,
  integerWithin,
  pageSizeSchema,
  type PolicyPageSize,
  type TypedPolicyDefinition
} from './typed-policy.js'

/**
 * 植物知识公开搜索策略（plant-knowledge / public_search）。
 * - `plant-knowledge-public-search/v1`：用户 2026-10-10 裁定，查询长度、结果上限、目录默认条数、百科引用长度迁入策略发布（64、20、10、512）。
 * - `plant-knowledge-public-search/v2`：plant-visual-axis-filter/v1（用户 2026-10-10 审定）在 v1 四字段取值不变的基础上，
 *   增加三轴筛选分页（默认 20、上限 50）与各轴数据版本（均为 visual-axis-all-v1，枚举 v1）。
 * 代码保留与数据库列长度 / 公开合同相等的绝对上限（`plant-knowledge.public_search.absolute_bounds`），策略只能在其内调整。
 */
export interface PlantKnowledgePublicSearchRules {
  /** 正文合同版本：v1 为原四字段，v2 增加三轴筛选字段。 */
  readonly contractVersion: 'plant-knowledge-public-search/v1' | 'plant-knowledge-public-search/v2'
  /** 搜索关键词（NFC、去首尾空白后）的最大 Unicode 码点数；已发布身份搜索与目录搜索共用。 */
  readonly searchQueryMaxCodePoints: number
  /** 搜索单次最多返回条数（已发布身份搜索固定返回上限；目录搜索 limit 的最大值）。 */
  readonly searchResultMaxItems: number
  /** 目录搜索省略 limit 时的默认条数，不超过 searchResultMaxItems。 */
  readonly catalogDefaultLimit: number
  /** 百科读取的分类引用与 slug 最大 Unicode 码点数。 */
  readonly encyclopediaReferenceMaxCodePoints: number
  /** 三轴筛选分页（仅 v2）：省略 limit 的默认条数与允许的最大条数，上限不超过合同绝对上限 50。 */
  readonly visualFilterPageSize?: PolicyPageSize
  /** 三轴筛选数据版本（仅 v2）：每轴唯一 extraction_version 与枚举 catalog_version。 */
  readonly visualAxisSources?: VisualAxisSources
}

/** 三轴筛选数据版本：同一请求三轴版本取自同一份快照，不按植物混用。 */
export interface VisualAxisSources {
  /** plant_visual_axis_values.catalog_version；请求取值合法性与展示名的唯一来源。 */
  readonly valueCatalogVersion: string
  /** 叶型使用的 extraction_version；Schema 只允许全量批次 visual-axis-all-v<n>。 */
  readonly LEAF_SHAPE: string
  /** 株型使用的 extraction_version。 */
  readonly GROWTH_FORM: string
  /** 叶面质感使用的 extraction_version。 */
  readonly LEAF_SURFACE: string
}

const bounds = RUNTIME_PARAMETERS.policyBounds.plantKnowledgePublicSearch.value

/** v1 原四字段的 Schema 片段；v2 原样复用，保证 v1 行为不变。 */
const searchFieldSchemas = {
  searchQueryMaxCodePoints: integerWithin(1, bounds.searchQueryMaxCodePoints),
  searchResultMaxItems: integerWithin(bounds.catalogMinimumLimit, bounds.searchResultMaxItems),
  catalogDefaultLimit: integerWithin(bounds.catalogMinimumLimit, bounds.searchResultMaxItems),
  encyclopediaReferenceMaxCodePoints: integerWithin(1, bounds.encyclopediaReferenceMaxCodePoints)
} as const
const searchFieldNames = ['searchQueryMaxCodePoints', 'searchResultMaxItems', 'catalogDefaultLimit', 'encyclopediaReferenceMaxCodePoints']

/**
 * 只允许全量抽取批次：核心 90 的 visual-axis-v2 与旧 visual-axis-v1 不能冒充全量（合同 §4，硬规则）。
 * 长度 ≤ 32 与 extraction_version VARCHAR(32) 一致。
 */
const fullExtractionVersion = { type: 'string', pattern: '^visual-axis-all-v[1-9][0-9]{0,4}$', maxLength: 32 } as const

const validateV1 = compilePolicySchema<PlantKnowledgePublicSearchRules>({
  type: 'object', additionalProperties: false,
  required: ['contractVersion', ...searchFieldNames],
  properties: { contractVersion: { const: 'plant-knowledge-public-search/v1' }, ...searchFieldSchemas },
})
const validateV2 = compilePolicySchema<PlantKnowledgePublicSearchRules>({
  type: 'object', additionalProperties: false,
  required: ['contractVersion', ...searchFieldNames, 'visualFilterPageSize', 'visualAxisSources'],
  properties: {
    contractVersion: { const: 'plant-knowledge-public-search/v2' },
    ...searchFieldSchemas,
    visualFilterPageSize: pageSizeSchema(bounds.visualFilterMaxItems),
    visualAxisSources: {
      type: 'object', additionalProperties: false,
      required: ['valueCatalogVersion', 'LEAF_SHAPE', 'GROWTH_FORM', 'LEAF_SURFACE'],
      properties: {
        valueCatalogVersion: { type: 'string', pattern: '^[A-Za-z0-9._-]{1,32}$' },
        LEAF_SHAPE: fullExtractionVersion,
        GROWTH_FORM: fullExtractionVersion,
        LEAF_SURFACE: fullExtractionVersion,
      },
    },
  },
})

/** 策略定义：v2、v1 均可读；目录默认条数不得大于结果上限，三轴分页默认不得大于上限。 */
export const PLANT_KNOWLEDGE_PUBLIC_SEARCH_POLICY: TypedPolicyDefinition<PlantKnowledgePublicSearchRules> = Object.freeze({
  domainCode: 'plant-knowledge',
  policyCode: 'public_search',
  schemaVersions: Object.freeze(['plant-knowledge-public-search/v2', 'plant-knowledge-public-search/v1']),
  resolve: (document: unknown, schemaVersion: string) => {
    const valid = schemaVersion === 'plant-knowledge-public-search/v2' ? validateV2(document)
      : schemaVersion === 'plant-knowledge-public-search/v1' ? validateV1(document) : false
    if (!valid) { return null }
    const rules = document as PlantKnowledgePublicSearchRules
    if (rules.catalogDefaultLimit > rules.searchResultMaxItems) { return null }
    if (rules.visualFilterPageSize && rules.visualFilterPageSize.default > rules.visualFilterPageSize.max) { return null }
    return freezePolicy(structuredClone(rules))
  },
})
