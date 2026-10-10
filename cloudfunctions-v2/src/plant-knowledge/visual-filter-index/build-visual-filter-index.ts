import type { VisualAxisSources } from '../../configuration/business-policies/index.js'
import { assertCompleteCatalog } from '../application/filter-plants-by-visual-axes.js'
import { VISUAL_FILTER_AXES, type VisualAxisCode } from '../domain/visual-axis-filter.js'
import {
  assignVisualValueBits,
  computeVisualAxisMask,
  visualFilterSourceKey,
  type VisualAxisBitMap
} from '../domain/visual-filter-index.js'
import { createMysqlPlantVisualAxisRepository } from '../repository/mysql-plant-visual-axis-repository.js'

/**
 * 三轴筛选预计算索引的离线幂等回填（plant-visual-axis-filter/v1 修订 1，031 迁移；ClickUp z8v0kmvgab）。
 *
 * 前端类比：像构建一次「静态搜索索引」——离线把 75 万行 JSON 标签压成每株一行的位开关，线上接口只读结果。
 * 步骤：定位/创建索引批次 → 写入值位表 → 按百科内部 id 分批（每批一个事务：先删本区间旧条目再写新条目，并推进断点）
 * → 全部完成后核对条目数并标记 ready。
 * 幂等：已 ready 的批次直接返回 already_ready；中断后重跑从断点继续，重跑同一区间结果相同。
 * 默认 dry-run（apply=false）只读：给出批次状态、值位表与预计批数，不写任何表。
 */

/** 回填使用的数据库连接端口：参数化查询与事务。 */
export type VisualFilterIndexConnection = {
  /** 参数化只读查询，返回结果行。 */
  readonly query: (
    sql: string,
    parameters: readonly unknown[]
  ) => Promise<readonly Record<string, unknown>[]>
  /** 参数化写语句（INSERT / UPDATE / DELETE），不关心返回行。 */
  readonly execute: (sql: string, parameters: readonly unknown[]) => Promise<unknown>
  /** 开始一个批次事务。 */
  readonly beginTransaction: () => Promise<void>
  /** 提交当前批次事务。 */
  readonly commit: () => Promise<void>
  /** 回滚当前批次事务。 */
  readonly rollback: () => Promise<void>
}

/** 回填输入。 */
export type VisualFilterIndexBuildInput = {
  /** 已通过策略类型校验的三轴数据版本（来自发布文档）。 */
  readonly sources: VisualAxisSources
  /** 每批覆盖的百科内部 id 区间宽度（1–8000）。 */
  readonly batchSize: number
  /** true 才写库；false 为只读演练。 */
  readonly apply: boolean
  /** 当前 UTC 毫秒（写入时间戳）。 */
  readonly nowMs: number
  /**
   * 时长预算钩子：每完成一批、开始下一批前调用，返回 false 即保存断点退出（状态 paused）。
   * 每次调用至少处理一批，保证重复调用总能推进；省略表示一次跑完。
   */
  readonly shouldContinue?: () => boolean
}

/** 回填结果报告（不含连接参数与数据正文）。 */
export type VisualFilterIndexBuildReport = {
  /** built 本次建成 / paused 预算到期已保存断点 / already_ready 已就绪无需操作 / dry_run 只读演练。 */
  readonly status: 'built' | 'paused' | 'already_ready' | 'dry_run'
  /** 索引批次定位键。 */
  readonly sourceKey: string
  /** 索引批次内部 id；演练且尚未创建时为 null。 */
  readonly filterSetId: string | number | null
  /** 本次执行的批数（演练为预计批数）。 */
  readonly batches: number
  /** 就绪时收录的植物行数；演练为 null。 */
  readonly plantCount: number | null
  /** 下一次续跑的起始百科内部 id（演练为当前断点；已就绪为 null）。 */
  readonly nextEncyclopediaId: number | null
  /** 每个准入轴分配的值位数量。 */
  readonly bitCounts: Readonly<Record<VisualAxisCode, number>>
}

/** 每批 id 区间宽度的绝对上限：单条多行 INSERT 每行 8 个占位符，8000 × 8 = 64000 < 预处理语句 65535 个占位符上限。 */
const maximumBatchSize = 8_000

const maskColumns: Readonly<Record<VisualAxisCode, string>> = {
  LEAF_SHAPE: 'leaf_shape_mask',
  GROWTH_FORM: 'growth_form_mask',
  LEAF_SURFACE: 'leaf_surface_mask'
}

function asId(value: unknown, field: string): number {
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(`三轴筛选索引回填：${field} 非法`)
  }
  return number
}

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value
  }
  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
  }
}

/** 读取索引批次行。 */
async function readSet(connection: VisualFilterIndexConnection, sourceKey: string) {
  const rows = await connection.query(
    'SELECT id, status, next_encyclopedia_id FROM plant_visual_filter_sets WHERE source_key = ?',
    [sourceKey]
  )
  const row = rows[0]
  return row
    ? {
        id: asId(row.id, 'id'),
        status: String(row.status),
        nextId: asId(row.next_encyclopedia_id, 'next_encyclopedia_id')
      }
    : null
}

/** 写入值位表；已存在时必须与本次分配逐项一致，否则说明构建期间枚举被改动，拒绝继续。 */
async function ensureBits(
  connection: VisualFilterIndexConnection,
  filterSetId: number,
  bits: ReadonlyMap<VisualAxisCode, VisualAxisBitMap>,
  nowMs: number
): Promise<void> {
  const existing = await connection.query(
    'SELECT axis_code, value_code, bit_position FROM plant_visual_filter_value_bits WHERE filter_set_id = ?',
    [filterSetId]
  )
  const wanted = [...bits]
    .flatMap(([axisCode, map]) =>
      [...map].map(([valueCode, position]) => `${axisCode}|${valueCode}|${position}`)
    )
    .sort()
  if (existing.length > 0) {
    const have = existing
      .map(row => `${String(row.axis_code)}|${String(row.value_code)}|${Number(row.bit_position)}`)
      .sort()
    if (have.join('\n') !== wanted.join('\n')) {
      throw new Error('三轴筛选索引回填：值位表与当前生效枚举不一致，请使用新的枚举版本重建')
    }
    return
  }
  const rows = [...bits].flatMap(([axisCode, map]) =>
    [...map].map(([valueCode, position]) => [
      filterSetId,
      axisCode,
      valueCode,
      position,
      nowMs,
      nowMs
    ])
  )
  await connection.execute(
    `INSERT INTO plant_visual_filter_value_bits (filter_set_id, axis_code, value_code, bit_position, created_at_ms, updated_at_ms) VALUES ${rows.map(() => '(?, ?, ?, ?, ?, ?)').join(', ')}`,
    rows.flat()
  )
}

/** 计算一个百科 id 区间内的索引条目（至少一轴非 0 才收录）。 */
async function computeBatch(
  connection: VisualFilterIndexConnection,
  sources: VisualAxisSources,
  bits: ReadonlyMap<VisualAxisCode, VisualAxisBitMap>,
  low: number,
  high: number
) {
  const plants = await connection.query(
    'SELECT id, taxon_id FROM tropicals_species_encyclopedia_ref WHERE id >= ? AND id < ?',
    [low, high]
  )
  const versionParameters = VISUAL_FILTER_AXES.flatMap(axis => [
    axis.axisCode,
    sources[axis.axisCode]
  ])
  const results = await connection.query(
    `SELECT encyclopedia_id, axis_code, values_json FROM plant_visual_axis_results
WHERE encyclopedia_id >= ? AND encyclopedia_id < ? AND status = 'EXTRACTED'
  AND ((axis_code = ? AND extraction_version = ?) OR (axis_code = ? AND extraction_version = ?) OR (axis_code = ? AND extraction_version = ?))`,
    [low, high, ...versionParameters]
  )
  const masks = new Map<number, Record<VisualAxisCode, bigint>>()
  for (const row of results) {
    const id = asId(row.encyclopedia_id, 'encyclopedia_id')
    const axisCode = String(row.axis_code) as VisualAxisCode
    const axisBits = bits.get(axisCode)
    if (!axisBits) {
      continue
    }
    const entry = masks.get(id) ?? { LEAF_SHAPE: 0n, GROWTH_FORM: 0n, LEAF_SURFACE: 0n }
    entry[axisCode] = computeVisualAxisMask(parseJson(row.values_json), axisBits)
    masks.set(id, entry)
  }
  return plants.flatMap(plant => {
    const id = asId(plant.id, 'id')
    const entry = masks.get(id)
    const taxonId = plant.taxon_id
    if (
      !entry ||
      typeof taxonId !== 'string' ||
      !taxonId ||
      (entry.LEAF_SHAPE === 0n && entry.GROWTH_FORM === 0n && entry.LEAF_SURFACE === 0n)
    ) {
      return []
    }
    return [{ id, taxonId, entry }]
  })
}

/** 构建（或续建）三轴筛选索引。 */
export async function buildVisualFilterIndex(
  connection: VisualFilterIndexConnection,
  input: VisualFilterIndexBuildInput
): Promise<VisualFilterIndexBuildReport> {
  if (
    !Number.isSafeInteger(input.batchSize) ||
    input.batchSize < 1 ||
    input.batchSize > maximumBatchSize
  ) {
    throw new Error(`三轴筛选索引回填：batchSize 须为 1–${maximumBatchSize} 的整数`)
  }
  const sourceKey = visualFilterSourceKey(input.sources)
  const catalog = await createMysqlPlantVisualAxisRepository(connection).readCatalog(
    input.sources.valueCatalogVersion
  )
  assertCompleteCatalog(catalog)
  const bits = assignVisualValueBits(catalog)
  const bitCounts = Object.fromEntries(
    VISUAL_FILTER_AXES.map(axis => [axis.axisCode, bits.get(axis.axisCode)?.size ?? 0])
  ) as Record<VisualAxisCode, number>
  let set = await readSet(connection, sourceKey)
  if (set?.status === 'ready') {
    return {
      status: 'already_ready',
      sourceKey,
      filterSetId: set.id,
      batches: 0,
      plantCount: null,
      nextEncyclopediaId: null,
      bitCounts
    }
  }
  const maxRows = await connection.query(
    'SELECT MAX(id) AS max_id FROM tropicals_species_encyclopedia_ref',
    []
  )
  const maxId =
    maxRows[0]?.max_id === null || maxRows[0]?.max_id === undefined
      ? 0
      : asId(maxRows[0].max_id, 'max_id')
  const startId = set?.nextId ?? 0
  const plannedBatches = maxId < startId ? 0 : Math.ceil((maxId + 1 - startId) / input.batchSize)
  if (!input.apply) {
    return {
      status: 'dry_run',
      sourceKey,
      filterSetId: set?.id ?? null,
      batches: plannedBatches,
      plantCount: null,
      nextEncyclopediaId: startId,
      bitCounts
    }
  }
  if (set === null) {
    await connection.execute(
      `INSERT INTO plant_visual_filter_sets (source_key, sources_json, status, next_encyclopedia_id, plant_count, built_at_ms, created_at_ms, updated_at_ms)
       VALUES (?, CAST(? AS JSON), 'building', 0, 0, NULL, ?, ?)`,
      [sourceKey, JSON.stringify(input.sources), input.nowMs, input.nowMs]
    )
    set = await readSet(connection, sourceKey)
    if (set === null) {
      throw new Error('三轴筛选索引回填：批次创建后读回失败')
    }
  }
  const filterSetId = set.id
  await ensureBits(connection, filterSetId, bits, input.nowMs)
  let batches = 0
  let next = set.nextId
  for (let low = set.nextId; low <= maxId; low += input.batchSize) {
    if (batches > 0 && input.shouldContinue && !input.shouldContinue()) {
      return {
        status: 'paused',
        sourceKey,
        filterSetId,
        batches,
        plantCount: null,
        nextEncyclopediaId: next,
        bitCounts
      }
    }
    const high = low + input.batchSize
    const entries = await computeBatch(connection, input.sources, bits, low, high)
    await connection.beginTransaction()
    try {
      await connection.execute(
        'DELETE FROM plant_visual_filter_entries WHERE filter_set_id = ? AND encyclopedia_id >= ? AND encyclopedia_id < ?',
        [filterSetId, low, high]
      )
      if (entries.length > 0) {
        const columns = VISUAL_FILTER_AXES.map(axis => maskColumns[axis.axisCode])
        await connection.execute(
          `INSERT INTO plant_visual_filter_entries (filter_set_id, taxon_id, encyclopedia_id, ${columns.join(', ')}, created_at_ms, updated_at_ms)
           VALUES ${entries.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ')}`,
          entries.flatMap(item => [
            filterSetId,
            item.taxonId,
            item.id,
            ...VISUAL_FILTER_AXES.map(axis => item.entry[axis.axisCode].toString()),
            input.nowMs,
            input.nowMs
          ])
        )
      }
      await connection.execute(
        `UPDATE plant_visual_filter_sets SET next_encyclopedia_id = ?, updated_at_ms = GREATEST(updated_at_ms, ?) WHERE id = ? AND status = 'building'`,
        [high, input.nowMs, filterSetId]
      )
      await connection.commit()
    } catch (error: unknown) {
      await connection.rollback().catch(() => undefined)
      throw error
    }
    batches += 1
    next = high
  }
  const countRows = await connection.query(
    'SELECT COUNT(*) AS plant_count FROM plant_visual_filter_entries WHERE filter_set_id = ?',
    [filterSetId]
  )
  const plantCount = asId(countRows[0]?.plant_count, 'plant_count')
  await connection.execute(
    `UPDATE plant_visual_filter_sets SET status = 'ready', plant_count = ?, built_at_ms = ?, updated_at_ms = GREATEST(updated_at_ms, ?) WHERE id = ? AND status = 'building'`,
    [plantCount, input.nowMs, input.nowMs, filterSetId]
  )
  return {
    status: 'built',
    sourceKey,
    filterSetId,
    batches,
    plantCount,
    nextEncyclopediaId: next,
    bitCounts
  }
}

/** 共享 mysql2 连接（预处理语句通道）的最小形态。 */
export type PreparedStatementConnection = {
  /** 参数化只读查询。 */
  readonly query: (
    sql: string,
    parameters: readonly (string | number | null)[]
  ) => Promise<readonly Record<string, unknown>[]>
  /** 参数化写语句（INSERT / UPDATE / DELETE）。 */
  readonly execute: (
    sql: string,
    parameters: readonly (string | number | null)[]
  ) => Promise<unknown>
  /** 开始一个批次事务。 */
  readonly beginTransaction: () => Promise<void>
  /** 提交当前批次事务。 */
  readonly commit: () => Promise<void>
  /** 回滚当前批次事务。 */
  readonly rollback: () => Promise<void>
}

/** 把共享 mysql2 连接来源取出的连接适配为回填端口（事件函数入口与真实库测试共用）。 */
export function asVisualFilterIndexConnection(
  connection: PreparedStatementConnection
): VisualFilterIndexConnection {
  return {
    query: (sql, parameters) => connection.query(sql, parameters as (string | number | null)[]),
    execute: (sql, parameters) => connection.execute(sql, parameters as (string | number | null)[]),
    beginTransaction: () => connection.beginTransaction(),
    commit: () => connection.commit(),
    rollback: () => connection.rollback()
  }
}
