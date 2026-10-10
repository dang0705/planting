import type { VisualAxisSources } from '../../configuration/business-policies/index.js'
import {
  VISUAL_FILTER_AXES,
  type VisualAxisCatalogAxis,
  type VisualAxisCatalogValue,
  type VisualAxisCode
} from '../domain/visual-axis-filter.js'

/** 参数化只读 SQL 执行边界；连接生命周期由调用方管理。 */
export type VisualAxisSqlExecutor = {
  /** 用参数化查询返回结果行，不得拼接用户输入。 */
  readonly query: (
    sql: string,
    parameters: readonly (string | number | null)[]
  ) => Promise<readonly Record<string, unknown>[]>
}

/** 筛选命中的一株植物（内部 id 只用于回查三轴取值，不进入公开响应）。 */
export type VisualFilterPlantRow = {
  /** 百科内部 id（encyclopedia_id）；只在服务端回查取值。 */
  readonly encyclopediaInternalId: string | number
  /** 公开目录引用 taxon_id。 */
  readonly taxonRef: string
  /** 百科展示名（name），不可为空。 */
  readonly displayName: string
  /** 百科学名（scientific_name），可能为空。 */
  readonly scientificName: string | null
  /** 封面相对引用原值。 */
  readonly coverImageRef: unknown
  /** 封面来源 JSON 原值。 */
  readonly coverSourceJson: unknown
}

/** 某株在某轴的取值原值。 */
export type VisualAxisValueRow = {
  /** 百科内部 id。 */
  readonly encyclopediaInternalId: string | number
  /** 该取值行所属轴代码（axis_code）。 */
  readonly axisCode: string
  /** values_json 原值。 */
  readonly values: unknown
}

/** 筛选主查询入参。 */
export type VisualFilterSearch = {
  /** 已就绪索引批次的内部 id（由策略 visualAxisSources 的 source_key 定位）。 */
  readonly filterSetId: string | number
  /** 至少一个轴的请求掩码（同轴 OR 已合并为按位或），跨轴为 AND。 */
  readonly masks: ReadonlyArray<{
    /** 该请求掩码作用的准入轴代码。 */
    readonly axisCode: VisualAxisCode
    /** 同轴所选值按位或后的请求掩码。 */
    readonly mask: bigint
  }>
  /** 上一页最后一个 taxon_id；首页为 null。 */
  readonly afterTaxonRef: string | null
  /** 本次取的行数 = limit + 1（多 1 行判断是否还有下一页）。 */
  readonly fetchLimit: number
}

/** 索引值位表的一行。 */
export type VisualFilterValueBitRow = {
  /** 该值位所属的准入轴代码。 */
  readonly axisCode: string
  /** 枚举值代码（区分大小写）。 */
  readonly valueCode: string
  /** 该值在本轴掩码中的位序号（0–63）。 */
  readonly bitPosition: number
}

/** 准入轴 → 索引条目表掩码列（固定白名单，不拼接用户输入）。 */
const maskColumns: Readonly<Record<VisualAxisCode, string>> = {
  LEAF_SHAPE: 'leaf_shape_mask',
  GROWTH_FORM: 'growth_form_mask',
  LEAF_SURFACE: 'leaf_surface_mask'
}

const admittedAxisCodes = VISUAL_FILTER_AXES.map(axis => axis.axisCode)

/** 生效枚举：只读策略锁定的 catalog_version、is_active=1、三准入轴。 */
const catalogSql = `SELECT axis_code, axis_name_zh, value_code, value_name_zh, value_definition_zh, sort_order
FROM plant_visual_axis_values
WHERE catalog_version = ? AND is_active = 1 AND axis_code IN (?, ?, ?)
ORDER BY axis_code, sort_order, value_code`

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`三轴筛选字段损坏: ${field}`)
  }
  return value
}

function optionalText(value: unknown, field: string): string | null {
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value !== 'string') {
    throw new Error(`三轴筛选字段损坏: ${field}`)
  }
  return value
}

function internalId(value: unknown): string | number {
  if (
    (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) ||
    (typeof value === 'string' && /^[1-9][0-9]*$/u.test(value))
  ) {
    return value
  }
  throw new Error('三轴筛选字段损坏: encyclopedia_internal_id')
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

/** 三轴筛选只读 Repository：SQL 全部参数化，只读，不写库。 */
export function createMysqlPlantVisualAxisRepository(executor: VisualAxisSqlExecutor) {
  return {
    /** 读取生效枚举；返回按轴分组的映射（缺某轴时由调用方判定为数据不完整）。 */
    async readCatalog(
      catalogVersion: string
    ): Promise<ReadonlyMap<VisualAxisCode, VisualAxisCatalogAxis>> {
      const rows = await executor.query(catalogSql, [catalogVersion, ...admittedAxisCodes])
      const grouped = new Map<
        VisualAxisCode,
        { nameZh: string; values: VisualAxisCatalogValue[] }
      >()
      for (const row of rows) {
        const axisCode = requiredText(row.axis_code, 'axis_code') as VisualAxisCode
        if (!admittedAxisCodes.includes(axisCode)) {
          continue
        }
        const sortOrder = Number(row.sort_order)
        if (!Number.isInteger(sortOrder)) {
          throw new Error('三轴筛选字段损坏: sort_order')
        }
        const entry = grouped.get(axisCode) ?? {
          nameZh: requiredText(row.axis_name_zh, 'axis_name_zh'),
          values: []
        }
        entry.values.push({
          valueCode: requiredText(row.value_code, 'value_code'),
          nameZh: requiredText(row.value_name_zh, 'value_name_zh'),
          definitionZh: requiredText(row.value_definition_zh, 'value_definition_zh'),
          sortOrder
        })
        grouped.set(axisCode, entry)
      }
      const catalog = new Map<VisualAxisCode, VisualAxisCatalogAxis>()
      for (const [axisCode, entry] of grouped) {
        const values = [...entry.values].sort(
          (left, right) =>
            left.sortOrder - right.sortOrder ||
            (left.valueCode < right.valueCode ? -1 : left.valueCode > right.valueCode ? 1 : 0)
        )
        catalog.set(axisCode, { axisCode, nameZh: entry.nameZh, values })
      }
      return catalog
    },

    /** 按 source_key 读取已就绪索引批次；未构建、构建中或不存在返回 null。 */
    async readReadyFilterSet(sourceKey: string): Promise<string | number | null> {
      const rows = await executor.query(
        `SELECT id FROM plant_visual_filter_sets WHERE source_key = ? AND status = 'ready' LIMIT 2`,
        [sourceKey]
      )
      if (rows.length > 1) {
        throw new Error('三轴筛选索引批次不唯一')
      }
      return rows[0] ? internalId(rows[0].id) : null
    },

    /** 读取索引批次的值位表。 */
    async readValueBits(filterSetId: string | number): Promise<readonly VisualFilterValueBitRow[]> {
      const rows = await executor.query(
        'SELECT axis_code, value_code, bit_position FROM plant_visual_filter_value_bits WHERE filter_set_id = ?',
        [filterSetId]
      )
      return rows.map(row => {
        const bitPosition = Number(row.bit_position)
        if (!Number.isInteger(bitPosition) || bitPosition < 0 || bitPosition > 63) {
          throw new Error('三轴筛选字段损坏: bit_position')
        }
        return {
          axisCode: requiredText(row.axis_code, 'axis_code'),
          valueCode: requiredText(row.value_code, 'value_code'),
          bitPosition
        }
      })
    },

    /**
     * 筛选主查询（修订 1）：只扫预计算索引的覆盖索引 (filter_set_id, taxon_id, 掩码…)，按 taxon_id 顺序判断
     * 「请求掩码 & 条目掩码 ≠ 0」（同轴 OR、跨轴 AND），命中行再按主键联百科、按 taxon_id 联可搜索目录，凑满 fetchLimit 即停。
     * STRAIGHT_JOIN 固定以索引表为驱动，避免优化器改为全表扫目录再排序。
     */
    async filterPlants(search: VisualFilterSearch): Promise<readonly VisualFilterPlantRow[]> {
      if (search.masks.length === 0) {
        throw new Error('三轴筛选缺少条件')
      }
      const ordered = VISUAL_FILTER_AXES.flatMap(axis =>
        search.masks.filter(item => item.axisCode === axis.axisCode)
      )
      const clauses = [
        'f.filter_set_id = ?',
        ...ordered.map(item => `(f.${maskColumns[item.axisCode]} & CAST(? AS UNSIGNED)) <> 0`)
      ]
      const parameters: (string | number)[] = [
        search.filterSetId,
        ...ordered.map(item => item.mask.toString())
      ]
      if (search.afterTaxonRef !== null) {
        clauses.push('f.taxon_id > ?')
        parameters.push(search.afterTaxonRef)
      }
      parameters.push(search.fetchLimit)
      const sql = `SELECT STRAIGHT_JOIN e.id AS encyclopedia_internal_id, e.taxon_id, e.name, e.scientific_name, e.cover_image_ref, e.cover_source_json
FROM plant_visual_filter_entries AS f FORCE INDEX (idx_visual_filter_entry_scan)
JOIN tropicals_species_encyclopedia_ref AS e ON e.id = f.encyclopedia_id
JOIN plant_search_documents AS d ON d.taxon_id = e.taxon_id AND d.is_searchable = 1
WHERE ${clauses.join('\n  AND ')}
ORDER BY f.taxon_id
LIMIT ?`
      const rows = await executor.query(sql, parameters)
      return rows.map(row => ({
        encyclopediaInternalId: internalId(row.encyclopedia_internal_id),
        taxonRef: requiredText(row.taxon_id, 'taxon_id'),
        displayName: requiredText(row.name, 'name'),
        scientificName: optionalText(row.scientific_name, 'scientific_name'),
        coverImageRef: row.cover_image_ref,
        coverSourceJson: row.cover_source_json
      }))
    },

    /** 回查命中植物在三轴所选版本的 EXTRACTED 取值（按唯一键）；无命中植物时不查询。 */
    async readAxisValues(
      encyclopediaInternalIds: readonly (string | number)[],
      sources: VisualAxisSources
    ): Promise<readonly VisualAxisValueRow[]> {
      if (encyclopediaInternalIds.length === 0) {
        return []
      }
      const placeholders = encyclopediaInternalIds.map(() => '?').join(', ')
      const sql = `SELECT r.encyclopedia_id AS encyclopedia_internal_id, r.axis_code, r.values_json
FROM plant_visual_axis_results AS r
WHERE r.encyclopedia_id IN (${placeholders}) AND r.status = 'EXTRACTED'
  AND ((r.axis_code = ? AND r.extraction_version = ?) OR (r.axis_code = ? AND r.extraction_version = ?) OR (r.axis_code = ? AND r.extraction_version = ?))`
      const versionParameters = admittedAxisCodes.flatMap(axisCode => [axisCode, sources[axisCode]])
      const rows = await executor.query(sql, [...encyclopediaInternalIds, ...versionParameters])
      return rows.map(row => ({
        encyclopediaInternalId: internalId(row.encyclopedia_internal_id),
        axisCode: requiredText(row.axis_code, 'axis_code'),
        values: parseJson(row.values_json)
      }))
    }
  }
}

/** Repository 公开形态，供应用层端口复用。 */
export type PlantVisualAxisRepository = ReturnType<typeof createMysqlPlantVisualAxisRepository>
