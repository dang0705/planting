import { RUNTIME_PARAMETERS } from '../../configuration/runtime-parameters.js'
import type {
  PublishedPlantSqlExecutor,
  PublishedPlantSqlRow
} from './mysql-published-plant-repository.js'

/** 已发布身份搜索 Repository 的安全返回值；只保留最多 20 条公开行与是否有后续命中。 */
export type PublishedPlantSearchRepositoryResult = {
  /** 稳定排序后的公开读取最小行，不超过固定公开上限。 */
  readonly rows: readonly PublishedPlantSqlRow[]
  /** 第 21 条存在时为 true；第 21 条不会进入返回行。 */
  readonly truncated: boolean
}

/** 已发布植物身份搜索 Repository。 */
export type PublishedPlantSearchRepository = {
  /** 按规范化查询词搜索当前双 active release 准入身份；maxItems 来自请求内锁定的公开搜索策略。 */
  readonly searchPublishedPlants: (
    query: string,
    maxItems: number
  ) => Promise<PublishedPlantSearchRepositoryResult>
}

/** 返回条数的代码绝对上限（`plant-knowledge.public_search.absolute_bounds.searchResultMaxItems` = 公开合同 20）；策略只能在其内调小。 */
const absoluteMaximumItems =
  RUNTIME_PARAMETERS.policyBounds.plantKnowledgePublicSearch.value.searchResultMaxItems
const extraLookaheadRowCount = 1
const zero = 0

/**
 * 只匹配已发布身份的中文展示名和主分类接受学名；双指针与 ACTIVE 明细谓词沿用详情读取合同。
 * 固定 `!` 为 LIKE 转义符，查询值只绑定参数，百分号、下划线和 `!` 均按字面字符匹配。
 * 与目录搜索不同，这里列侧 COLLATE 不影响索引：名称列本无索引，计划由当前发布明细
 * `uq_knowledge_release_item` 驱动并按唯一键回表，LIKE 只是回表后的过滤，开销受已发布身份数约束。
 */
const searchPublishedPlantsSql = `SELECT identity_record.public_identity_ref,
       identity_record.display_name_zh,
       identity_record.identity_kind,
       taxon.accepted_scientific_name,
       taxon.taxon_rank
  FROM plant_identities AS identity_record
  JOIN plant_taxa AS taxon
    ON taxon.id = identity_record.primary_taxon_internal_id
  JOIN active_plant_knowledge_releases AS identity_pointer
    ON identity_pointer.release_kind = 'identity'
  JOIN plant_knowledge_release_items AS identity_item
    ON identity_item.release_internal_id = identity_pointer.release_internal_id
   AND identity_item.subject_kind = 'identity'
   AND identity_item.subject_ref = identity_record.public_identity_ref
   AND identity_item.admission_status = 'ACTIVE'
  JOIN active_plant_knowledge_releases AS taxonomy_pointer
    ON taxonomy_pointer.release_kind = 'taxonomy'
  JOIN plant_knowledge_release_items AS taxon_item
    ON taxon_item.release_internal_id = taxonomy_pointer.release_internal_id
   AND taxon_item.subject_kind = 'taxon'
   AND taxon_item.subject_ref = taxon.public_taxon_ref
   AND taxon_item.admission_status = 'ACTIVE'
 WHERE (identity_record.display_name_zh COLLATE utf8mb4_unicode_ci LIKE ? ESCAPE '!'
     OR taxon.accepted_scientific_name COLLATE utf8mb4_unicode_ci LIKE ? ESCAPE '!')
   AND identity_record.review_status = 'ACTIVE'
   AND taxon.review_status = 'ACTIVE'
 ORDER BY CASE
            WHEN identity_record.display_name_zh COLLATE utf8mb4_unicode_ci =
                   CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
              OR taxon.accepted_scientific_name COLLATE utf8mb4_unicode_ci =
                   CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
            THEN 0 ELSE 1
          END ASC,
          identity_record.display_name_zh COLLATE utf8mb4_unicode_ci ASC,
          taxon.accepted_scientific_name COLLATE utf8mb4_unicode_ci ASC,
          identity_record.public_identity_ref COLLATE utf8mb4_unicode_ci ASC
 LIMIT `

/** 转义 LIKE 的显式转义符与两个通配符；反斜杠在 `ESCAPE '!'` 下保持普通字符。 */
function toLiteralPrefixPattern(query: string): string {
  return `${query.replace(/[!%_]/gu, character => `!${character}`)}%`
}

/** 把未知驱动行收窄为详情读取合同的最小字段白名单。 */
function toPublishedPlantRow(row: Record<string, unknown>): PublishedPlantSqlRow {
  const fields = [
    'public_identity_ref',
    'display_name_zh',
    'identity_kind',
    'accepted_scientific_name',
    'taxon_rank'
  ] as const
  for (const field of fields) {
    if (typeof row[field] !== 'string') {
      throw new Error('已发布植物搜索结果字段类型不符合合同')
    }
  }
  return {
    public_identity_ref: row.public_identity_ref as string,
    display_name_zh: row.display_name_zh as string,
    identity_kind: row.identity_kind as string,
    accepted_scientific_name: row.accepted_scientific_name as string,
    taxon_rank: row.taxon_rank as string
  }
}

/** 创建基于 MySQL 的已发布身份搜索；参数化 SQL 是本 Repository 唯一的数据库访问路径。 */
export function createMysqlPublishedPlantSearchRepository(
  executor: PublishedPlantSqlExecutor
): PublishedPlantSearchRepository {
  return {
    async searchPublishedPlants(query, maxItems) {
      // LIMIT 只能拼接已校验整数（mysql2 预处理语句不接受 LIMIT 占位符）；多读 1 行用于判断 truncated。
      if (!Number.isSafeInteger(maxItems) || maxItems < 1 || maxItems > absoluteMaximumItems) {
        throw new RangeError('搜索返回上限不合法')
      }
      const pattern = toLiteralPrefixPattern(query)
      const rows = await executor.query(
        `${searchPublishedPlantsSql}${String(maxItems + extraLookaheadRowCount)}`,
        [pattern, pattern, query, query]
      )
      const validatedRows = rows.map(toPublishedPlantRow)
      const truncated = validatedRows.length > maxItems
      return {
        rows: validatedRows.slice(zero, maxItems),
        truncated
      }
    }
  }
}
