/** 植物身份公开准入查询使用的最小 SQL 行。 */
export type PublishedIdentitySqlRow = {
  /** MySQL EXISTS 的 0/1 结果，不是公开响应字段。 */
  readonly published: number
}

/** 参数化 SQL 执行边界；连接和事务生命周期由调用方管理。 */
export type PublishedIdentitySqlExecutor = {
  /** 用只读参数化查询返回 MySQL 行，不得拼接身份引用。 */
  readonly query: (
    sql: string,
    parameters: readonly unknown[]
  ) => Promise<readonly PublishedIdentitySqlRow[]>
}

/** 查询当前产品身份是否具备已发布、未隔离的公开确认资格。 */
export type PublishedIdentityRepository = {
  /** 只返回资格布尔值；不暴露内部主键或未发布身份资料。 */
  readonly isPublishedIdentity: (identityRef: string) => Promise<boolean>
}

/** `EXISTS` 查询必须且只能返回一行。 */
const expectedRowCount = 1
/** 单行 EXISTS 结果所在的数组位置。 */
const firstRowIndex = 0
/** MySQL `EXISTS` 为真时的数值。 */
const publishedFlag = 1

/**
 * 公开身份准入只以当前两类生效发布及其逐项明细为依据。
 * 表级 ACTIVE 仍需检查，以便隔离或撤销后立即停止新的确认；
 * 但 ACTIVE 本身不能绕过任一发布指针，也不能把供应商候选当成产品身份。
 */
export function createMysqlPublishedIdentityRepository(
  executor: PublishedIdentitySqlExecutor
): PublishedIdentityRepository {
  return {
    async isPublishedIdentity(identityRef) {
      const rows = await executor.query(
        `SELECT EXISTS (
           SELECT 1
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
         ) AS published`,
        [identityRef]
      )
      return rows.length === expectedRowCount && rows.at(firstRowIndex)?.published === publishedFlag
    }
  }
}
