import { createNodeRequestChainHandler } from '../../foundation/http/node-request-chain-handler.js'
import type { RouteHandler } from '../../foundation/http/route-dispatcher.js'
import {
  VISUAL_FILTER_AXES,
  type VisualAxisCatalogAxis,
  type VisualAxisCode,
  type VisualAxisParameter
} from '../domain/visual-axis-filter.js'
import {
  assertCompleteCatalog,
  requireVisualFilterPolicy,
  visualFilterPublicReason,
  type PlantVisualAxisDependencies
} from './filter-plants-by-visual-axes.js'

/** visual-axes 公开响应（plant-visual-axis-filter/v1 §6）。 */
export type PlantVisualAxesResponse = {
  /** 本次使用的策略发布版本。 */
  readonly policyReleaseVersion: string
  /** 三个准入轴，固定顺序：叶型、株型、叶面质感。 */
  readonly axes: ReadonlyArray<{
    /** 准入轴代码，固定三轴之一。 */
    readonly axisCode: VisualAxisCode
    /** visual-filter 中对应的查询参数名。 */
    readonly queryParameter: VisualAxisParameter
    /** 轴中文名，供筛选面板分组标题。 */
    readonly nameZh: string
    /** 可选值（sort_order 升序，再按代码）；不含排序号等内部列。 */
    readonly values: ReadonlyArray<{
      /** 可选值代码，visual-filter 请求使用。 */
      readonly valueCode: string
      /** 可选值中文名，供面板选项展示。 */
      readonly nameZh: string
      /** 可选值中文定义，供说明浮层展示。 */
      readonly definitionZh: string
    }>
  }>
}

type AxesOutcome = {
  /** 本次策略发布版本，原样写入响应。 */
  readonly releaseVersion: string
  /** 已确认完整的三轴生效枚举。 */
  readonly catalog: ReadonlyMap<VisualAxisCode, VisualAxisCatalogAxis>
}

/** 创建 visual-axes 公开 GET：策略 503 → 读生效枚举 → 缺准入轴 500 → 白名单响应。 */
export function createListPlantVisualAxesRouteHandler(
  dependencies: PlantVisualAxisDependencies
): RouteHandler {
  const handler = createNodeRequestChainHandler<
    Record<string, never>,
    undefined,
    undefined,
    { readonly releaseVersion: string; readonly catalogVersion: string },
    { readonly releaseVersion: string; readonly catalogVersion: string },
    { readonly releaseVersion: string; readonly catalogVersion: string },
    AxesOutcome,
    PlantVisualAxesResponse
  >({
    requestLimits: {
      kind: 'execute',
      run: request => {
        request.resume()
        return {}
      }
    },
    identityValidate: { kind: 'not_applicable', reason: visualFilterPublicReason },
    principalResolve: { kind: 'not_applicable', reason: visualFilterPublicReason },
    objectOwnership: { kind: 'not_applicable', reason: '视觉枚举不包含用户数据' },
    dtoValidate: {
      kind: 'execute',
      run: async () => {
        const policy = await requireVisualFilterPolicy(dependencies.readPublicSearchSnapshot)
        return {
          releaseVersion: policy.releaseVersion,
          catalogVersion: policy.sources.valueCatalogVersion
        }
      }
    },
    buildCommand: { kind: 'execute', run: ({ dto }) => dto },
    domainRule: { kind: 'execute', run: ({ command }) => command },
    transactionPersistence: {
      kind: 'execute',
      run: async ({ domainDecision }) => {
        const catalog = await dependencies.visualAxes.readCatalog(domainDecision.catalogVersion)
        assertCompleteCatalog(catalog)
        return { releaseVersion: domainDecision.releaseVersion, catalog }
      }
    },
    publicResponse: {
      kind: 'execute',
      run: outcome => ({
        policyReleaseVersion: outcome.releaseVersion,
        axes: VISUAL_FILTER_AXES.map(axis => {
          const entry = outcome.catalog.get(axis.axisCode)!
          return {
            axisCode: axis.axisCode,
            queryParameter: axis.queryParameter,
            nameZh: entry.nameZh,
            values: entry.values.map(value => ({
              valueCode: value.valueCode,
              nameZh: value.nameZh,
              definitionZh: value.definitionZh
            }))
          }
        })
      })
    },
    writeAudit: dependencies.writeAudit
  })
  return (request, response) => handler(request, response)
}
