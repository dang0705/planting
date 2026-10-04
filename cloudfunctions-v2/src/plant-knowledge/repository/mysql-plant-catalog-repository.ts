import type {
  PlantCatalogItem,
  PlantCatalogQuery,
  PlantCatalogResult
} from '../application/search-plant-catalog.js'
import type { PublishedPlantSqlExecutor } from './mysql-published-plant-repository.js'

/** 目录只读 Repository；同一文档仅保留最佳匹配，同名不同分类不合并。 */
export type PlantCatalogRepository = {
  /** 返回目录公开 DTO；可选身份必须通过当前双发布准入。 */
  readonly searchPlantCatalog: (query: PlantCatalogQuery) => Promise<PlantCatalogResult>
}

/**
 * 先在目录独立检索，再可选关联当前已发布身份；没有身份发布不隐藏目录。
 * 绑定查询参数且固定 LIKE 转义符，避免用户字符成为 SQL 通配符。
 * 每个文档按精确、优先级、主词条排序选优；多身份候选时不附带引用。
 */
const searchSql = `WITH matches AS (
 SELECT document.id AS document_id, document.taxon_id, document.preferred_display_name,
        document.scientific_name, document.taxon_rank, document.taxonomic_status,
        document.is_selectable, document.has_encyclopedia, document.has_image,
        COALESCE(term.target_identity_internal_id, document.v2_identity_internal_id) AS identity_id,
        CASE WHEN term.normalized_term COLLATE utf8mb4_unicode_ci =
          CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci THEN 0 ELSE 1 END AS match_class,
        term.match_priority, term.is_primary, term.id AS term_id
 FROM plant_search_terms AS term
 JOIN plant_search_documents AS document ON document.id = term.search_document_internal_id
 WHERE term.is_active = 1 AND document.is_searchable = 1
   AND term.normalized_term COLLATE utf8mb4_unicode_ci LIKE ? ESCAPE '!'
), ranked AS (
 SELECT matches.*, ROW_NUMBER() OVER (
   PARTITION BY document_id ORDER BY match_class, match_priority, is_primary DESC, term_id
 ) AS row_rank FROM matches
), mappings AS (
 SELECT document_id, COUNT(DISTINCT identity_id) AS mapping_count, MIN(identity_id) AS identity_id
 FROM matches GROUP BY document_id
), published AS (
 SELECT identity_record.id, identity_record.public_identity_ref
 FROM plant_identities AS identity_record
 JOIN plant_taxa AS taxon ON taxon.id = identity_record.primary_taxon_internal_id
 JOIN active_plant_knowledge_releases AS identity_pointer ON identity_pointer.release_kind = 'identity'
 JOIN plant_knowledge_release_items AS identity_item
   ON identity_item.release_internal_id = identity_pointer.release_internal_id
  AND identity_item.subject_kind = 'identity'
  AND identity_item.subject_ref = identity_record.public_identity_ref
  AND identity_item.admission_status = 'ACTIVE'
 JOIN active_plant_knowledge_releases AS taxonomy_pointer ON taxonomy_pointer.release_kind = 'taxonomy'
 JOIN plant_knowledge_release_items AS taxon_item
   ON taxon_item.release_internal_id = taxonomy_pointer.release_internal_id
  AND taxon_item.subject_kind = 'taxon'
  AND taxon_item.subject_ref = taxon.public_taxon_ref
  AND taxon_item.admission_status = 'ACTIVE'
 WHERE identity_record.review_status = 'ACTIVE' AND taxon.review_status = 'ACTIVE'
)
SELECT ranked.taxon_id, ranked.preferred_display_name, ranked.scientific_name,
       ranked.taxon_rank, ranked.taxonomic_status, ranked.is_selectable,
       ranked.has_encyclopedia, ranked.has_image, published.public_identity_ref
FROM ranked JOIN mappings ON mappings.document_id = ranked.document_id
LEFT JOIN published ON mappings.mapping_count = 1 AND published.id = mappings.identity_id
WHERE ranked.row_rank = 1
ORDER BY ranked.match_class, ranked.match_priority, ranked.is_primary DESC,
         ranked.preferred_display_name COLLATE utf8mb4_unicode_ci,
         ranked.scientific_name COLLATE utf8mb4_unicode_ci,
         ranked.taxon_id COLLATE utf8mb4_unicode_ci
LIMIT ?`

/** 驱动布尔标志仅接受数据库合法的 0／1，不进行 JavaScript 真值强转。 */
function readFlag(row: Record<string, unknown>, field: string): boolean {
  const value = row[field]
  if (value !== 0 && value !== 1 && value !== false && value !== true)
    {throw new Error('目录布尔字段损坏')}
  return value === 1 || value === true
}
/** 验证字符串字段并执行公开白名单映射；内部关联字段不会返回。 */
function toItem(row: Record<string, unknown>): PlantCatalogItem {
  const fields = [
    'taxon_id',
    'preferred_display_name',
    'scientific_name',
    'taxon_rank',
    'taxonomic_status'
  ] as const
  for (const field of fields)
    {if (typeof row[field] !== 'string' || !row[field]) {throw new Error('目录字符串字段损坏')}}
  const identity = row.public_identity_ref
  if (identity !== null && identity !== undefined && (typeof identity !== 'string' || !identity))
    {throw new Error('目录身份引用损坏')}
  return {
    catalogTaxonRef: row.taxon_id as string,
    displayName: row.preferred_display_name as string,
    scientificName: row.scientific_name as string,
    taxonRank: row.taxon_rank as string,
    taxonomicStatus: row.taxonomic_status as string,
    selectable: readFlag(row, 'is_selectable'),
    hasEncyclopedia: readFlag(row, 'has_encyclopedia'),
    hasImage: readFlag(row, 'has_image'),
    ...(identity ? { plantIdentityRef: identity as string } : {})
  }
}
/** 创建目录 Repository；多读一条判断是否截断，不返回总数或内部主键。 */
export function createMysqlPlantCatalogRepository(
  executor: PublishedPlantSqlExecutor
): PlantCatalogRepository {
  return {
    async searchPlantCatalog(query) {
      const pattern = `${query.q.replace(/[!%_]/gu, character => `!${character}`)}%`
      const rows = await executor.query(searchSql, [query.q, pattern, query.limit + 1])
      return { items: rows.slice(0, query.limit).map(toItem), truncated: rows.length > query.limit }
    }
  }
}
