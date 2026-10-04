/** 已发布植物公开读取所需的最小 SQL 行；列名与 002_plant_knowledge.sql 一致。 */
export type PublishedPlantSqlRow = {
  /** 产品身份公开引用 plant_identities.public_identity_ref。 */
  readonly public_identity_ref: string
  /** 中文展示名 plant_identities.display_name_zh。 */
  readonly display_name_zh: string
  /** 产品身份类型 plant_identities.identity_kind。 */
  readonly identity_kind: string
  /** 主要分类实体接受学名 plant_taxa.accepted_scientific_name。 */
  readonly accepted_scientific_name: string
  /** 主要分类实体分类等级 plant_taxa.taxon_rank。 */
  readonly taxon_rank: string
}

/** 参数化只读 SQL 执行边界；连接生命周期由调用方管理。 */
export type PublishedPlantSqlExecutor = {
  /** 用参数化查询返回结果行，不得拼接身份引用。 */
  readonly query: (
    sql: string,
    parameters: readonly (string | number | null)[]
  ) => Promise<readonly Record<string, unknown>[]>
}

/** 已发布植物读取 Repository。 */
export type PublishedPlantRepository = {
  /** 仅当身份满足公开可见谓词时返回最小行，否则返回 null。 */
  readonly findPublishedPlant: (plantIdentityRef: string) => Promise<PublishedPlantSqlRow | null>
}

const maximumMatchedRows = 1

/**
 * 可见性谓词与 `mysql-published-identity-repository` 相同：身份与主要分类实体均为 ACTIVE，
 * 且分别被当前 identity、taxonomy active release 的 ACTIVE 明细收录。缺一即不可见。
 */
const selectPublishedPlantSql = `SELECT identity_record.public_identity_ref,
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
 WHERE identity_record.public_identity_ref = ?
   AND identity_record.review_status = 'ACTIVE'
   AND taxon.review_status = 'ACTIVE'
 LIMIT 2`

/** 把驱动返回的未知行收窄为最小行；字段类型不符时失败关闭。 */
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
      throw new Error('已发布植物查询结果字段类型不符合合同')
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

/** 创建已发布植物读取 Repository；公开引用唯一，匹配多行视为数据损坏并失败关闭。 */
export function createMysqlPublishedPlantRepository(
  executor: PublishedPlantSqlExecutor
): PublishedPlantRepository {
  return {
    async findPublishedPlant(plantIdentityRef) {
      const rows = await executor.query(selectPublishedPlantSql, [plantIdentityRef])
      if (rows.length > maximumMatchedRows) {
        throw new Error('已发布植物查询命中多行')
      }
      const [row] = rows
      return row ? toPublishedPlantRow(row) : null
    }
  }
}
