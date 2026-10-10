import type { MysqlConnectionPoolPort } from '../../foundation/database/mysql-transaction-driver.js'
import { toSqlParameters, withReadConnection, type Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'

/** 一次最多查询的植物数（与列表页大小上限一致，硬规则 user-plant.list.page_size）。 */
const maxRefs = 50
const userRefFormat = /^usr_[A-Za-z0-9_-]{8,}$/u
const plantRefFormat = /^upl_[A-Za-z0-9_-]{8,}$/u

/**
 * 品种绑定存在性只读查询（档案完整度 catalog_binding 项）：按统一用户归属限定，只返回“有绑定”的植物公开引用集合。
 * 不返回目录引用本身，不读他人植物。
 */
export function createMysqlCatalogBindingPresenceReader(source: MysqlConnectionPoolPort<Mysql2QueryConnection>) {
  return {
    /** 返回给定植物中存在品种绑定的公开引用集合；输入非法抛错。 */
    read: async (userRef: string, userPlantRefs: readonly string[]): Promise<ReadonlySet<string>> => {
      const refs = [...new Set(userPlantRefs)]
      if (!userRefFormat.test(userRef) || refs.length > maxRefs || refs.some(ref => !plantRefFormat.test(ref))) { throw new TypeError('品种绑定存在性查询输入不合法') }
      if (refs.length === 0) { return new Set() }
      const rows = await withReadConnection(source, connection => connection.query(
        `SELECT p.public_user_plant_id FROM user_plants p JOIN users u ON u.id = p.user_internal_id
          WHERE BINARY u.public_user_id = BINARY ? AND p.public_user_plant_id IN (${refs.map(() => '?').join(', ')})
            AND EXISTS (SELECT 1 FROM user_plant_catalog_bindings b WHERE b.user_internal_id = p.user_internal_id AND b.user_plant_internal_id = p.id)`,
        toSqlParameters([userRef, ...refs])))
      return new Set(rows.map(row => String(row.public_user_plant_id)).filter(ref => refs.includes(ref)))
    }
  }
}
