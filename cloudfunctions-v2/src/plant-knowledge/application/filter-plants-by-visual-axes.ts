import type { IncomingMessage } from 'node:http'

import { RUNTIME_PARAMETERS } from '../../configuration/runtime-parameters.js'
import type {
  PlantKnowledgePublicSearchRules,
  VisualAxisSources
} from '../../configuration/business-policies/index.js'
import { createNodeRequestChainHandler } from '../../foundation/http/node-request-chain-handler.js'
import {
  PublicRequestError,
  type RequestChainAuditEvent
} from '../../foundation/http/request-chain.js'
import type { RouteHandler } from '../../foundation/http/route-dispatcher.js'
import {
  requirePolicySnapshot,
  type PolicySnapshotPort
} from '../../foundation/policy/require-policy.js'
import { toTropicalsCoverImage, type TropicalsCoverImage } from '../domain/tropicals-cover-image.js'
import {
  encodeVisualFilterCursor,
  parseVisualFilterQuery,
  selectionsWithinCatalog,
  toPublicAxisValues,
  VISUAL_FILTER_AXES,
  type VisualAxisCatalogAxis,
  type VisualAxisCode,
  type VisualAxisParameter,
  type VisualAxisSelection
} from '../domain/visual-axis-filter.js'
import { selectionMask, visualFilterSourceKey } from '../domain/visual-filter-index.js'
import type {
  VisualAxisValueRow,
  VisualFilterPlantRow,
  VisualFilterSearch,
  VisualFilterValueBitRow
} from '../repository/mysql-plant-visual-axis-repository.js'

/** 三轴筛选只读端口；由 Repository 实现，每个方法各自借用一条只读连接。 */
export type PlantVisualAxisPort = {
  /** 读取策略锁定版本的生效枚举。 */
  readonly readCatalog: (
    catalogVersion: string
  ) => Promise<ReadonlyMap<VisualAxisCode, VisualAxisCatalogAxis>>
  /** 按 source_key 读取已就绪索引批次 id；未就绪为 null。 */
  readonly readReadyFilterSet: (sourceKey: string) => Promise<string | number | null>
  /** 读取索引批次的值位表。 */
  readonly readValueBits: (
    filterSetId: string | number
  ) => Promise<readonly VisualFilterValueBitRow[]>
  /** 筛选主查询（读预计算索引，多取 1 行）。 */
  readonly filterPlants: (search: VisualFilterSearch) => Promise<readonly VisualFilterPlantRow[]>
  /** 回查命中植物的三轴取值。 */
  readonly readAxisValues: (
    ids: readonly (string | number)[],
    sources: VisualAxisSources
  ) => Promise<readonly VisualAxisValueRow[]>
}

/** 三轴筛选两个入口的共同依赖。 */
export type PlantVisualAxisDependencies = {
  /** 读取 plant-knowledge/public_search 带版本号快照；null 或 v1 正文时 503。 */
  readonly readPublicSearchSnapshot: PolicySnapshotPort<PlantKnowledgePublicSearchRules>
  /** 三轴数据只读端口。 */
  readonly visualAxes: PlantVisualAxisPort
  /** 只接收脱敏请求结果的审计端口。 */
  readonly writeAudit: (event: RequestChainAuditEvent) => void | Promise<void>
}

/** 已确认可用于三轴筛选的策略快照（v2 正文）。 */
export type VisualFilterPolicy = {
  /** 公开的发布版本号。 */
  readonly releaseVersion: string
  /** 分页默认与上限（策略 visualFilterPageSize）。 */
  readonly pageSize: {
    /** 省略 limit 时的每页条数。 */
    readonly default: number
    /** 允许的最大 limit，不超过绝对上限 50。 */
    readonly max: number
  }
  /** 三轴版本与枚举版本。 */
  readonly sources: VisualAxisSources
}

/** 合同 items 绝对上限 50（代码硬边界，策略只能在其内调整）。 */
const absoluteMaxItems =
  RUNTIME_PARAMETERS.policyBounds.plantKnowledgePublicSearch.value.visualFilterMaxItems
export const visualFilterPublicReason = '三轴筛选为公开非个性化读取，不解析用户或平台主体'

/** 请求内锁定一次策略：不可用、或活动发布不含三轴字段（仍为 v1）时 503。 */
export async function requireVisualFilterPolicy(
  read: PolicySnapshotPort<PlantKnowledgePublicSearchRules>
): Promise<VisualFilterPolicy> {
  const snapshot = await requirePolicySnapshot(read)
  const { visualFilterPageSize, visualAxisSources } = snapshot.rules
  if (!visualFilterPageSize || !visualAxisSources || visualFilterPageSize.max > absoluteMaxItems) {
    throw new PublicRequestError(503, 'SERVICE_UNAVAILABLE', '服务暂时不可用')
  }
  return {
    releaseVersion: snapshot.releaseVersion,
    pageSize: visualFilterPageSize,
    sources: visualAxisSources
  }
}

/** 生效枚举必须完整包含三个准入轴，否则视为数据不完整（500）。 */
export function assertCompleteCatalog(
  catalog: ReadonlyMap<VisualAxisCode, VisualAxisCatalogAxis>
): void {
  if (VISUAL_FILTER_AXES.some(axis => (catalog.get(axis.axisCode)?.values.length ?? 0) === 0)) {
    throw new Error('三轴生效枚举不完整')
  }
}

/** 已校验的筛选命令。 */
type VisualFilterCommand = {
  /** 请求内锁定的三轴策略快照。 */
  readonly policy: VisualFilterPolicy
  /** 各轴筛选条件（跨轴 AND、同轴 OR）。 */
  readonly selections: readonly VisualAxisSelection[]
  /** 本页条数（已按策略补默认并校验上限）。 */
  readonly limit: number
  /** 游标解出的上一页最后 taxon_id；首页为空。 */
  readonly afterTaxonRef: string | null
}

/** 公开结果项。 */
export type PlantVisualFilterItem = {
  /** 目录引用 taxon_id。 */
  readonly catalogTaxonRef: string
  /** 百科展示名（name），用于结果卡片标题。 */
  readonly displayName: string
  /** 百科学名（scientific_name），可能为空。 */
  readonly scientificName: string | null
  /** 封面（plant-encyclopedia-read/v2 同一 DTO）。 */
  readonly coverImage: TropicalsCoverImage | null
  /** 三轴公开取值；缺值为 null。 */
  readonly visualAxes: Readonly<Record<VisualAxisParameter, string[] | null>>
}

/** 公开响应。 */
export type PlantVisualFilterResponse = {
  /** 本次使用的策略发布版本。 */
  readonly policyReleaseVersion: string
  /** 本页结果（taxon_id 升序）。 */
  readonly items: readonly PlantVisualFilterItem[]
  /** 下一页游标；没有下一页为 null。 */
  readonly nextCursor: string | null
}

type FilterOutcome =
  | 'invalid_value'
  | 'index_unavailable'
  | {
      /** 本次策略发布版本，原样写入响应。 */
      readonly releaseVersion: string
      /** 本页条数，多取的一行只用于判断下一页。 */
      readonly limit: number
      /** 生效枚举，用于整理三轴公开取值。 */
      readonly catalog: ReadonlyMap<VisualAxisCode, VisualAxisCatalogAxis>
      /** 主查询命中行（最多 limit + 1 行）。 */
      readonly rows: readonly VisualFilterPlantRow[]
      /** 命中植物在三轴的取值原值。 */
      readonly values: readonly VisualAxisValueRow[]
    }

function readSearchParameters(request: IncomingMessage): URLSearchParams {
  request.resume()
  return new URL(request.url ?? '/', 'http://127.0.0.1').searchParams
}

/** 组装公开结果：截到 limit，多取的 1 行只用于生成 nextCursor。 */
function toResponse(
  outcome: Exclude<FilterOutcome, 'invalid_value' | 'index_unavailable'>
): PlantVisualFilterResponse {
  const page = outcome.rows.slice(0, outcome.limit)
  const valuesById = new Map<string, Map<string, unknown>>()
  for (const row of outcome.values) {
    const key = String(row.encyclopediaInternalId)
    const axes = valuesById.get(key) ?? new Map<string, unknown>()
    axes.set(row.axisCode, row.values)
    valuesById.set(key, axes)
  }
  const items = page.map(row => {
    const axes = valuesById.get(String(row.encyclopediaInternalId))
    const visualAxes = Object.fromEntries(
      VISUAL_FILTER_AXES.map(axis => [
        axis.queryParameter,
        toPublicAxisValues(axes?.get(axis.axisCode), outcome.catalog.get(axis.axisCode))
      ])
    ) as Record<VisualAxisParameter, string[] | null>
    return {
      catalogTaxonRef: row.taxonRef,
      displayName: row.displayName,
      scientificName: row.scientificName,
      coverImage: toTropicalsCoverImage({
        taxonId: row.taxonRef,
        coverImageRef: row.coverImageRef,
        coverSourceJson: row.coverSourceJson
      }),
      visualAxes
    }
  })
  const last = page.at(-1)
  return {
    policyReleaseVersion: outcome.releaseVersion,
    items,
    nextCursor:
      outcome.rows.length > outcome.limit && last ? encodeVisualFilterCursor(last.taxonRef) : null
  }
}

/** 创建 visual-filter 公开 GET：策略 503 → 参数 400 → 枚举 400 → 主查询 → 取值回查 → 白名单响应。 */
export function createFilterPlantsByVisualAxesRouteHandler(
  dependencies: PlantVisualAxisDependencies
): RouteHandler {
  const handler = createNodeRequestChainHandler<
    URLSearchParams,
    undefined,
    undefined,
    VisualFilterCommand,
    VisualFilterCommand,
    VisualFilterCommand,
    FilterOutcome,
    PlantVisualFilterResponse
  >({
    requestLimits: { kind: 'execute', run: readSearchParameters },
    identityValidate: { kind: 'not_applicable', reason: visualFilterPublicReason },
    principalResolve: { kind: 'not_applicable', reason: visualFilterPublicReason },
    objectOwnership: { kind: 'not_applicable', reason: '目录与视觉标签不包含用户数据' },
    dtoValidate: {
      kind: 'execute',
      run: async parameters => {
        const policy = await requireVisualFilterPolicy(dependencies.readPublicSearchSnapshot)
        const parsed = parseVisualFilterQuery(parameters)
        const limit = parsed.ok ? (parsed.limit ?? policy.pageSize.default) : 0
        if (!parsed.ok || limit > policy.pageSize.max) {
          throw new PublicRequestError(400, 'VALIDATION_FAILED', '请求参数不合法')
        }
        return { policy, selections: parsed.selections, limit, afterTaxonRef: parsed.afterTaxonRef }
      }
    },
    buildCommand: { kind: 'execute', run: ({ dto }) => dto },
    domainRule: { kind: 'execute', run: ({ command }) => command },
    transactionPersistence: {
      kind: 'execute',
      run: async ({ domainDecision }) => {
        const { policy } = domainDecision
        const catalog = await dependencies.visualAxes.readCatalog(
          policy.sources.valueCatalogVersion
        )
        assertCompleteCatalog(catalog)
        if (!selectionsWithinCatalog(domainDecision.selections, catalog)) {
          return 'invalid_value'
        }
        // 修订 1：策略 visualAxisSources → source_key → 已就绪索引；未就绪或位表过期一律 503，不回退结果表直查。
        const filterSetId = await dependencies.visualAxes.readReadyFilterSet(
          visualFilterSourceKey(policy.sources)
        )
        if (filterSetId === null) {
          return 'index_unavailable'
        }
        const bitsByAxis = new Map<string, Map<string, number>>()
        for (const bit of await dependencies.visualAxes.readValueBits(filterSetId)) {
          const axisBits = bitsByAxis.get(bit.axisCode) ?? new Map<string, number>()
          axisBits.set(bit.valueCode, bit.bitPosition)
          bitsByAxis.set(bit.axisCode, axisBits)
        }
        const masks: Array<{ axisCode: VisualAxisCode; mask: bigint }> = []
        for (const selection of domainDecision.selections) {
          const mask = selectionMask(selection.values, bitsByAxis.get(selection.axisCode))
          if (mask === null) {
            return 'index_unavailable'
          }
          masks.push({ axisCode: selection.axisCode, mask })
        }
        const rows = await dependencies.visualAxes.filterPlants({
          filterSetId,
          masks,
          afterTaxonRef: domainDecision.afterTaxonRef,
          fetchLimit: domainDecision.limit + 1
        })
        const ids = rows.slice(0, domainDecision.limit).map(row => row.encyclopediaInternalId)
        const values = await dependencies.visualAxes.readAxisValues(ids, policy.sources)
        return {
          releaseVersion: policy.releaseVersion,
          limit: domainDecision.limit,
          catalog,
          rows,
          values
        }
      }
    },
    publicResponse: {
      kind: 'execute',
      run: outcome => {
        if (outcome === 'invalid_value') {
          throw new PublicRequestError(400, 'VALIDATION_FAILED', '请求参数不合法')
        }
        if (outcome === 'index_unavailable') {
          throw new PublicRequestError(503, 'SERVICE_UNAVAILABLE', '服务暂时不可用')
        }
        return toResponse(outcome)
      }
    },
    writeAudit: dependencies.writeAudit
  })
  return (request, response) => handler(request, response)
}
