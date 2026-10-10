/** Tropicals 目录只读查询执行端口；由入口绑定新的只读连接。 */
export interface TropicalsTaxonSqlExecutor {
  /** 执行参数化 SELECT 并返回结果行；不得拼接输入。 */
  readonly query: (
    sql: string,
    parameters: readonly (string | number | null)[]
  ) => Promise<readonly Record<string, unknown>[]>
}

/** 目录条目最小公开语义：只给长期养护与日历标题使用。 */
export interface TropicalsTaxonSummary {
  /** Tropicals 目录引用原值（与 taxon_id 二进制相等）。 */
  readonly catalogTaxonRef: string
  /** 目录中的品种中文名；为空白时视为没有名称。 */
  readonly displayName: string | null
}

/** 二进制比较避免外部表排序规则把大小写或尾随空格视为同一引用。 */
const readSql = `SELECT taxon_id, name FROM tropicals_species_encyclopedia_ref WHERE BINARY taxon_id = BINARY ? LIMIT 2`

/**
 * plant-knowledge 只读适配：确认 Tropicals 目录引用存在并读出中文名（long-term-care/v1 §1、§9）。
 * 不存在返回 null；多行或字段不合法属于外部表合同破坏，抛出内部错误由上游脱敏。
 */
export function createMysqlTropicalsTaxonReader(executor: TropicalsTaxonSqlExecutor): {
  /** 按目录引用读取摘要；不存在返回 null。 */
  readonly read: (catalogTaxonRef: string) => Promise<TropicalsTaxonSummary | null>
} {
  return {
    async read(catalogTaxonRef) {
      if (
        typeof catalogTaxonRef !== 'string' ||
        catalogTaxonRef.length === 0 ||
        catalogTaxonRef.length > 512
      ) {
        throw new TypeError('目录引用不合法')
      }
      const rows = await executor.query(readSql, [catalogTaxonRef])
      if (rows.length === 0) {
        return null
      }
      if (
        rows.length !== 1 ||
        rows[0]!.taxon_id !== catalogTaxonRef ||
        typeof rows[0]!.name !== 'string'
      ) {
        throw new Error('Tropicals 目录条目读回不合法')
      }
      const name = (rows[0]!.name as string).trim()
      return { catalogTaxonRef, displayName: name.length > 0 ? name : null }
    }
  }
}
