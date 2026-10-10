import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import type { Mysql2QueryConnection } from '../../../src/foundation/database/mysql2-connection-source.js'
import { createPlantKnowledgeServer } from '../../../src/plant-knowledge/http/server.js'
import { fixturePolicyPorts } from '../../support/business-policy-fixtures.js'

/**
 * 三轴筛选 L3 / unit_fake 共用夹具：真实 node:http、冻结路由、请求链与 Repository 映射；
 * 只替换 MySQL 连接（按 SQL 片段分派）与策略快照端口。行数据照抄 qinghuazhi_v2_test 只读抽样（2026-10-10）。
 */
/** 假 MySQL 返回的一行。 */
export type Row = Record<string, unknown>
/** 参数化查询绑定值。 */
export type Parameters = readonly (string | number | null)[]

export const filterPath = '/api/v2/plant-knowledge/catalog/visual-filter'
export const axesPath = '/api/v2/plant-knowledge/catalog/visual-axes'

/** 生效枚举（catalog_version=v1）的子集，含不得公开的内部列。 */
export const catalogRows: Row[] = [
  {
    id: 1,
    axis_code: 'LEAF_SHAPE',
    axis_name_zh: '叶型',
    value_code: 'HEART',
    value_name_zh: '心形',
    value_definition_zh: '叶片整体呈心形、卵心形或宽心形。',
    sort_order: 10,
    catalog_version: 'v1'
  },
  {
    id: 2,
    axis_code: 'LEAF_SHAPE',
    axis_name_zh: '叶型',
    value_code: 'ELLIPTIC',
    value_name_zh: '椭圆/卵圆形',
    value_definition_zh: '椭圆轮廓',
    sort_order: 40,
    catalog_version: 'v1'
  },
  {
    id: 3,
    axis_code: 'LEAF_SHAPE',
    axis_name_zh: '叶型',
    value_code: 'LOBED',
    value_name_zh: '裂叶/羽裂形',
    value_definition_zh: '裂叶轮廓',
    sort_order: 125,
    catalog_version: 'v1'
  },
  {
    id: 4,
    axis_code: 'GROWTH_FORM',
    axis_name_zh: '株型',
    value_code: 'UPRIGHT',
    value_name_zh: '直立高挑',
    value_definition_zh: '主干向上',
    sort_order: 10,
    catalog_version: 'v1'
  },
  {
    id: 5,
    axis_code: 'GROWTH_FORM',
    axis_name_zh: '株型',
    value_code: 'VINING',
    value_name_zh: '攀援藤本',
    value_definition_zh: '藤本骨架',
    sort_order: 40,
    catalog_version: 'v1'
  },
  {
    id: 6,
    axis_code: 'LEAF_SURFACE',
    axis_name_zh: '叶面质感',
    value_code: 'GLOSSY',
    value_name_zh: '有光泽',
    value_definition_zh: '光泽',
    sort_order: 20,
    catalog_version: 'v1'
  },
  {
    id: 7,
    axis_code: 'LEAF_SURFACE',
    axis_name_zh: '叶面质感',
    value_code: 'LEATHERY',
    value_name_zh: '革质',
    value_definition_zh: '革质',
    sort_order: 30,
    catalog_version: 'v1'
  }
]

/** 筛选命中行：百科 + 可搜索目录联表结果（龟背竹真实数据）。 */
export function plantRow(taxonId: string, encyclopediaId: number, overrides: Row = {}): Row {
  return {
    encyclopedia_internal_id: encyclopediaId,
    taxon_id: taxonId,
    name: '龟背竹',
    scientific_name: 'Monstera deliciosa',
    cover_image_ref: 'img/2026/04/95279010eb36.webp',
    cover_source_json: {
      schemaVersion: 'tropicals-cover-reference/v1',
      imageRef: 'img/2026/04/95279010eb36.webp',
      displayPolicy: 'USER_ACCEPTED_UNKNOWN_LICENSE_RISK_TEST_REFERENCE',
      reviewStatus: 'PENDING'
    },
    ...overrides
  }
}
/** 龟背竹 taxon_id。 */
export const monstera = 'https://tropicals.cn/species/monstera-deliciosa'

/** 三轴取值行（all-v1 真实值，龟背竹：叶型 HEART,LOBED；株型 VINING；叶面 LEATHERY,GLOSSY）。 */
export const axisValueRows: Row[] = [
  {
    encyclopedia_internal_id: 1,
    axis_code: 'LEAF_SHAPE',
    values_json: ['LOBED', 'HEART'],
    status: 'EXTRACTED',
    confidence: 'HIGH',
    evidence_text: '幼叶呈心形',
    source_hash: 'h'
  },
  {
    encyclopedia_internal_id: 1,
    axis_code: 'GROWTH_FORM',
    values_json: ['VINING', 'NOT_IN_CATALOG'],
    status: 'EXTRACTED',
    confidence: 'HIGH',
    evidence_text: '常绿藤本',
    source_hash: 'h'
  },
  {
    encyclopedia_internal_id: 1,
    axis_code: 'LEAF_SURFACE',
    values_json: ['LEATHERY', 'GLOSSY'],
    status: 'EXTRACTED',
    confidence: 'HIGH',
    evidence_text: '革质',
    source_hash: 'h'
  }
]

/** 运行时状态：当前服务与已记录的查询。 */
export const fakeState = {
  server: undefined as Server | undefined,
  calls: [] as Array<{ sql: string; parameters: Parameters }>
}

/** 假数据库与策略快照替换项。 */
export type Options = {
  readonly pageRows?: readonly Row[]
  readonly axisRows?: readonly Row[]
  readonly catalog?: readonly Row[]
  readonly failure?: Error
  readonly snapshot?: () => Promise<unknown>
}

/** 按 SQL 片段分派的假 MySQL：枚举查询、筛选主查询、命中植物的三轴取值查询。 */
export async function start(options: Options = {}): Promise<string> {
  fakeState.calls = []
  const connection: Mysql2QueryConnection = {
    beginTransaction: async () => undefined,
    commit: async () => undefined,
    rollback: async () => undefined,
    release: () => undefined,
    destroy: () => undefined,
    execute: async () => ({ affectedRows: 0, insertId: 0 }),
    query: async (sql, parameters) => {
      fakeState.calls.push({ sql, parameters })
      if (options.failure) {
        throw options.failure
      }
      if (sql.includes('FROM plant_visual_axis_values')) {
        return options.catalog ?? catalogRows
      }
      if (sql.includes('ORDER BY e.taxon_id')) {
        return options.pageRows ?? [plantRow(monstera, 1)]
      }
      return options.axisRows ?? axisValueRows
    }
  }
  const ports = fixturePolicyPorts()
  const server = createPlantKnowledgeServer({
    ...ports,
    ...(options.snapshot
      ? { readPublicSearchSnapshot: options.snapshot as typeof ports.readPublicSearchSnapshot }
      : {}),
    connectionSource: { getConnection: async () => connection },
    writeAudit: () => undefined
  })
  fakeState.server = server
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

/** 关闭服务；供 afterEach 调用。 */
export async function stop(): Promise<void> {
  const server = fakeState.server
  if (server) {
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
  fakeState.server = undefined
}
