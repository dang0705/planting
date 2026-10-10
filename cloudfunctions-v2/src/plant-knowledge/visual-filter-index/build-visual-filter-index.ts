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
  /** 参数化写语句（INSERT / UPDATE / DELETE），返回受影响行数。 */
  readonly execute: (
    sql: string,
    parameters: readonly unknown[]
  ) => Promise<{
    /** 本次语句实际影响的行数。 */
    readonly affectedRows: number
  }>
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
  /** built 本次建成 / paused 预算到期已保存断点 / busy 另一调用正在回填 / already_ready 已就绪无需操作 / dry_run 只读演练。 */
  readonly status: 'built' | 'paused' | 'busy' | 'already_ready' | 'dry_run'
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
/** 回填失败阶段：定位在哪一步出错（不含数据）。 */
export type VisualFilterIndexBuildStage =
  | 'read_catalog'
  | 'read_set'
  | 'lock'
  | 'write_set'
  | 'write_bits'
  | 'compute_batch'
  | 'write_batch'
  | 'checkpoint_conflict'
  | 'finalize'

/**
 * 带阶段的回填错误：只携带阶段与 MySQL 驱动错误码（code / errno / sqlState），
 * 不保留原始 message（MySQL 的重复键等报错原文会包含 taxon 等数据）。
 */
export class VisualFilterIndexBuildError extends Error {
  /** 失败阶段。 */
  readonly stage: VisualFilterIndexBuildStage
  /** MySQL 驱动错误码（如 ER_DUP_ENTRY）；非数据库错误为 null。 */
  readonly errorCode: string | null
  /** MySQL 数字错误号（如 1062）；非数据库错误为 null。 */
  readonly errno: number | null
  /** SQLSTATE（如 23000）；非数据库错误为 null。 */
  readonly sqlState: string | null

  constructor(stage: VisualFilterIndexBuildStage, cause: unknown) {
    super(`三轴筛选索引回填失败：${stage}`)
    this.name = 'VisualFilterIndexBuildError'
    this.stage = stage
    const record =
      cause !== null && typeof cause === 'object' ? (cause as Record<string, unknown>) : {}
    this.errorCode =
      typeof record.code === 'string' && /^[A-Z0-9_]{1,64}$/u.test(record.code) ? record.code : null
    this.errno =
      typeof record.errno === 'number' && Number.isSafeInteger(record.errno) ? record.errno : null
    this.sqlState =
      typeof record.sqlState === 'string' && /^[0-9A-Z]{5}$/u.test(record.sqlState)
        ? record.sqlState
        : null
  }
}

/** 在指定阶段执行；失败统一包装为带阶段的错误（已包装的原样抛出）。 */
async function inStage<T>(stage: VisualFilterIndexBuildStage, work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (error: unknown) {
    if (error instanceof VisualFilterIndexBuildError) {
      throw error
    }
    throw new VisualFilterIndexBuildError(stage, error)
  }
}

/** 单条多行 INSERT 的行数：控制语句大小与占位符数量（1000 × 8 = 8000 个）。 */
const insertChunkRows = 1_000

/** 同一索引批次的会话级命名锁名（≤ 64 字符）；连接断开时 MySQL 自动释放。 */
const lockNameOf = (sourceKey: string) => `qhz_visual_filter_index_${sourceKey.slice(0, 32)}`

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
  const catalog = await inStage('read_catalog', () =>
    createMysqlPlantVisualAxisRepository(connection).readCatalog(input.sources.valueCatalogVersion)
  )
  assertCompleteCatalog(catalog)
  const bits = assignVisualValueBits(catalog)
  const bitCounts = Object.fromEntries(
    VISUAL_FILTER_AXES.map(axis => [axis.axisCode, bits.get(axis.axisCode)?.size ?? 0])
  ) as Record<VisualAxisCode, number>
  const report = (
    status: VisualFilterIndexBuildReport['status'],
    fields: Partial<VisualFilterIndexBuildReport>
  ): VisualFilterIndexBuildReport => ({
    status,
    sourceKey,
    filterSetId: null,
    batches: 0,
    plantCount: null,
    nextEncyclopediaId: null,
    bitCounts,
    ...fields
  })
  const readState = async () => {
    const set = await readSet(connection, sourceKey)
    const maxRows = await connection.query(
      'SELECT MAX(id) AS max_id FROM tropicals_species_encyclopedia_ref',
      []
    )
    const maxId =
      maxRows[0]?.max_id === null || maxRows[0]?.max_id === undefined
        ? 0
        : asId(maxRows[0].max_id, 'max_id')
    return { set, maxId }
  }
  const before = await inStage('read_set', readState)
  if (before.set?.status === 'ready') {
    return report('already_ready', { filterSetId: before.set.id })
  }
  if (!input.apply) {
    const startId = before.set?.nextId ?? 0
    return report('dry_run', {
      filterSetId: before.set?.id ?? null,
      batches:
        before.maxId < startId ? 0 : Math.ceil((before.maxId + 1 - startId) / input.batchSize),
      nextEncyclopediaId: startId
    })
  }
  // 并发保护：同一索引批次同一时刻只允许一个调用写入；拿不到锁立即返回 busy（不等待）。
  const lockName = lockNameOf(sourceKey)
  const lockRows = await inStage('lock', () =>
    connection.query('SELECT GET_LOCK(?, 0) AS acquired', [lockName])
  )
  if (Number(lockRows[0]?.acquired) !== 1) {
    return report('busy', {
      filterSetId: before.set?.id ?? null,
      nextEncyclopediaId: before.set?.nextId ?? null
    })
  }
  try {
    // 拿到锁后重读：另一调用可能刚刚完成或推进了断点。
    const { set: current, maxId } = await inStage('read_set', readState)
    if (current?.status === 'ready') {
      return report('already_ready', { filterSetId: current.id })
    }
    let set = current
    if (set === null) {
      await inStage('write_set', () =>
        connection.execute(
          `INSERT INTO plant_visual_filter_sets (source_key, sources_json, status, next_encyclopedia_id, plant_count, built_at_ms, created_at_ms, updated_at_ms)
       VALUES (?, CAST(? AS JSON), 'building', 0, 0, NULL, ?, ?)`,
          [sourceKey, JSON.stringify(input.sources), input.nowMs, input.nowMs]
        )
      )
      set = await inStage('read_set', () => readSet(connection, sourceKey))
      if (set === null) {
        throw new VisualFilterIndexBuildError('write_set', new Error('批次创建后读回失败'))
      }
    }
    const filterSetId = set.id
    await inStage('write_bits', () => ensureBits(connection, filterSetId, bits, input.nowMs))
    let batches = 0
    let next = set.nextId
    for (let low = set.nextId; low <= maxId; low += input.batchSize) {
      if (batches > 0 && input.shouldContinue && !input.shouldContinue()) {
        return report('paused', { filterSetId, batches, nextEncyclopediaId: next })
      }
      const high = low + input.batchSize
      const entries = await inStage('compute_batch', () =>
        computeBatch(connection, input.sources, bits, low, high)
      )
      await inStage('write_batch', async () => {
        await connection.beginTransaction()
        try {
          await connection.execute(
            'DELETE FROM plant_visual_filter_entries WHERE filter_set_id = ? AND encyclopedia_id >= ? AND encyclopedia_id < ?',
            [filterSetId, low, high]
          )
          const columns = VISUAL_FILTER_AXES.map(axis => maskColumns[axis.axisCode])
          for (let offset = 0; offset < entries.length; offset += insertChunkRows) {
            const chunk = entries.slice(offset, offset + insertChunkRows)
            await connection.execute(
              `INSERT INTO plant_visual_filter_entries (filter_set_id, taxon_id, encyclopedia_id, ${columns.join(', ')}, created_at_ms, updated_at_ms)
           VALUES ${chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ')}`,
              chunk.flatMap(item => [
                filterSetId,
                item.taxonId,
                item.id,
                ...VISUAL_FILTER_AXES.map(axis => item.entry[axis.axisCode].toString()),
                input.nowMs,
                input.nowMs
              ])
            )
          }
          // 条件推进断点：只在断点仍等于本批起点时前进，防止并发或重入把断点回退。
          const advanced = await connection.execute(
            `UPDATE plant_visual_filter_sets SET next_encyclopedia_id = ?, updated_at_ms = GREATEST(updated_at_ms, ?)
           WHERE id = ? AND status = 'building' AND next_encyclopedia_id = ?`,
            [high, input.nowMs, filterSetId, low]
          )
          if (advanced.affectedRows !== 1) {
            throw new VisualFilterIndexBuildError(
              'checkpoint_conflict',
              new Error('断点已被其他调用改动')
            )
          }
          await connection.commit()
        } catch (error: unknown) {
          await connection.rollback().catch(() => undefined)
          throw error
        }
      })
      batches += 1
      next = high
    }
    const plantCount = await inStage('finalize', async () => {
      const countRows = await connection.query(
        'SELECT COUNT(*) AS plant_count FROM plant_visual_filter_entries WHERE filter_set_id = ?',
        [filterSetId]
      )
      const count = asId(countRows[0]?.plant_count, 'plant_count')
      await connection.execute(
        `UPDATE plant_visual_filter_sets SET status = 'ready', plant_count = ?, built_at_ms = ?, updated_at_ms = GREATEST(updated_at_ms, ?) WHERE id = ? AND status = 'building'`,
        [count, input.nowMs, input.nowMs, filterSetId]
      )
      return count
    })
    return report('built', { filterSetId, batches, plantCount, nextEncyclopediaId: next })
  } finally {
    await connection.query('SELECT RELEASE_LOCK(?) AS released', [lockName]).catch(() => undefined)
  }
}

/** 共享 mysql2 连接（预处理语句通道）的最小形态。 */
export type PreparedStatementConnection = {
  /** 参数化只读查询。 */
  readonly query: (
    sql: string,
    parameters: readonly (string | number | null)[]
  ) => Promise<readonly Record<string, unknown>[]>
  /** 参数化写语句（INSERT / UPDATE / DELETE），返回受影响行数。 */
  readonly execute: (
    sql: string,
    parameters: readonly (string | number | null)[]
  ) => Promise<{
    /** 本次语句实际影响的行数。 */
    readonly affectedRows: number
  }>
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
