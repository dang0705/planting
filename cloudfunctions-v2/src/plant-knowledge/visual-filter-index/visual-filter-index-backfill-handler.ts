import type { VisualAxisSources } from '../../configuration/business-policies/index.js'
import { PLANT_KNOWLEDGE_PUBLIC_SEARCH_POLICY } from '../../configuration/business-policies/index.js'
import publicSearchV2Release from '../../../models/policy-releases/plant-knowledge.public_search.v2.release.json'
import type {
  VisualFilterIndexBuildInput,
  VisualFilterIndexBuildReport
} from './build-visual-filter-index.js'

/**
 * 一次性事件函数 `visual-filter-index-backfill` 的 `main(event, context)` 适配（ClickUp z8v0kmvgab；
 * 用户 2026-10-10 授权「建一个一次性云函数在内网里跑回填」）。
 *
 * 前端类比：像一个可以反复点「继续」的长任务按钮——每次调用只在时长预算内干活，到点就存好进度退出，
 * 再点一次从存档处接着做；全部做完后再点什么都不发生。
 *
 * 事件只接受 `{ release, batchSize, apply, maxRunMs? }`：三轴数据版本只能来自打包进函数的 v2 发布文档（经策略类型校验），
 * 不接受事件内嵌任意版本，避免把核心 90 等非全量批次写成索引。返回值只含计数摘要，不含内部 id 与数据内容。
 */

/** 可回填的发布版本 → 打包进函数的发布文档（只登记已审定的 v2）。 */
const knownReleases: Readonly<
  Record<string, { readonly schemaVersion: string; readonly policy: unknown }>
> = {
  [publicSearchV2Release.releaseVersion]: publicSearchV2Release
}

/**
 * 时长预算占函数超时的比例：用掉 70% 即保存断点退出，留 30% 给当前批次收尾、提交与返回
 * （主代理 2026-10-10 任务说明给定；一次性运维工具，不进入运行时配置）。
 */
const timeBudgetFraction = 0.7

/** 单批 id 区间宽度上限，与回填模块一致（预处理语句占位符上限约束）。 */
const maximumBatchSize = 8_000

/** 事件入口依赖：回填用例与时钟。 */
export type VisualFilterIndexBackfillDependencies = {
  /** 回填用例（真实实现为 buildVisualFilterIndex 绑定一条连接）。 */
  readonly build: (input: VisualFilterIndexBuildInput) => Promise<VisualFilterIndexBuildReport>
  /** 当前 UTC 毫秒。 */
  readonly now: () => number
}

/** 事件入口返回的计数摘要（会出现在函数调用记录中）。 */
export type VisualFilterIndexBackfillResult =
  | {
      /** 回填结果状态：built / paused / already_ready / dry_run。 */
      readonly status: VisualFilterIndexBuildReport['status']
      /** 索引批次定位键（visualAxisSources 规范 JSON SHA-256，可公开）。 */
      readonly sourceKey: string
      /** 下一次续跑的起始百科 id；已就绪为 null。 */
      readonly nextEncyclopediaId: number | null
      /** 本次处理（演练为预计）的批数。 */
      readonly processedBatches: number
      /** 就绪时收录的植物行数；未就绪为 null。 */
      readonly plantCount: number | null
    }
  | {
      /** 未执行：rejected 事件非法 / not_started 无法确定时长预算。 */
      readonly status: 'rejected' | 'not_started'
      /** 稳定原因代码，不含事件内容。 */
      readonly reason: 'INVALID_EVENT' | 'TIME_LIMIT_UNKNOWN'
    }

/** 已校验事件。 */
type BackfillEvent = {
  /** 回填所依据的三轴数据版本。 */
  readonly sources: VisualAxisSources
  /** 每批 id 区间宽度。 */
  readonly batchSize: number
  /** true 才写库；false 为只读演练。 */
  readonly apply: boolean
  /** 可选的本次最长运行毫秒。 */
  readonly maxRunMs: number | null
}

const allowedKeys = new Set(['release', 'batchSize', 'apply', 'maxRunMs'])

function parseEvent(event: unknown): BackfillEvent | null {
  if (event === null || typeof event !== 'object' || Array.isArray(event)) {
    return null
  }
  const record = event as Record<string, unknown>
  if (Object.keys(record).some(key => !allowedKeys.has(key))) {
    return null
  }
  const release = typeof record.release === 'string' ? knownReleases[record.release] : undefined
  const { batchSize, apply, maxRunMs } = record
  if (!release || typeof apply !== 'boolean') {
    return null
  }
  if (
    typeof batchSize !== 'number' ||
    !Number.isSafeInteger(batchSize) ||
    batchSize < 1 ||
    batchSize > maximumBatchSize
  ) {
    return null
  }
  if (
    maxRunMs !== undefined &&
    (typeof maxRunMs !== 'number' || !Number.isSafeInteger(maxRunMs) || maxRunMs < 1)
  ) {
    return null
  }
  const rules = PLANT_KNOWLEDGE_PUBLIC_SEARCH_POLICY.resolve(release.policy, release.schemaVersion)
  if (!rules?.visualAxisSources) {
    return null
  }
  return { sources: rules.visualAxisSources, batchSize, apply, maxRunMs: maxRunMs ?? null }
}

/** 读取 CloudBase 事件函数上下文的函数超时毫秒（time_limit_in_ms）；不是正整数时返回 null。 */
function readFunctionTimeoutMs(context: unknown): number | null {
  if (context === null || typeof context !== 'object') {
    return null
  }
  const value = (context as { readonly time_limit_in_ms?: unknown }).time_limit_in_ms
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null
}

/** 创建事件入口。 */
export function createVisualFilterIndexBackfillHandler(
  dependencies: VisualFilterIndexBackfillDependencies
) {
  return async (event: unknown, context: unknown): Promise<VisualFilterIndexBackfillResult> => {
    const parsed = parseEvent(event)
    if (parsed === null) {
      return { status: 'rejected', reason: 'INVALID_EVENT' }
    }
    const timeoutMs = readFunctionTimeoutMs(context)
    const budgets = [
      timeoutMs === null ? null : Math.floor(timeoutMs * timeBudgetFraction),
      parsed.maxRunMs
    ].filter((value): value is number => value !== null)
    if (budgets.length === 0) {
      return { status: 'not_started', reason: 'TIME_LIMIT_UNKNOWN' }
    }
    const startedAt = dependencies.now()
    const deadline = startedAt + Math.min(...budgets)
    const report = await dependencies.build({
      sources: parsed.sources,
      batchSize: parsed.batchSize,
      apply: parsed.apply,
      nowMs: startedAt,
      shouldContinue: () => dependencies.now() < deadline
    })
    return {
      status: report.status,
      sourceKey: report.sourceKey,
      nextEncyclopediaId: report.nextEncyclopediaId,
      processedBatches: report.batches,
      plantCount: report.plantCount
    }
  }
}
