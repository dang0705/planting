import type { MysqlConnectionPoolPort, MysqlTransactionContext } from '../../foundation/database/mysql-transaction-driver.js'
import { withReadConnection, type Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'
import { calculateCanonicalJsonSha256, serializeCanonicalJson, type CanonicalJsonObject } from '../../foundation/json/canonical-json-sha256.js'

/** 长期养护输入快照的持久化命令；没有临时案例伪造长期植物的入口。 */
export interface EnvironmentSnapshotRecord {
  /** 不可变快照引用；创建者负责高熵生成，Repository 不生成可猜测编号。 */
  readonly snapshotRef: string
  /** 经认证解析的统一用户引用，不是平台主体标识。 */
  readonly userRef: string
  /** 必须属于该统一用户的长期用户植物引用。 */
  readonly userPlantRef: string
  /** 本次锁定的养护上下文正整数版本。 */
  readonly careContextVersion: number
  /** 请求已锁定的配置快照引用；不在此伪造策略发布。 */
  readonly configurationSnapshotRef: string
  /** 调用方按领域合同组装的 JSON 输入清单；本层只核验 JSON 与摘要。 */
  readonly inputManifest: CanonicalJsonObject
  /** 输入证据窗口开始的 UTC 毫秒。 */
  readonly evidenceWindowStartMs: number
  /** 输入证据窗口结束的 UTC 毫秒。 */
  readonly evidenceWindowEndMs: number
  /** 快照生成的 UTC 毫秒，不能早于证据窗口结束。 */
  readonly generatedAtMs: number
  /** 已锁定有效期的 UTC 毫秒；本层没有默认新鲜度。 */
  readonly validUntilMs: number
}

/** 内部读回结果；不作为公开 API DTO，不披露数据库主键。 */
export interface VerifiedEnvironmentSnapshot extends EnvironmentSnapshotRecord {
  /** 已用规范 JSON 重算并核对的输入清单 SHA-256。 */
  readonly inputManifestSha256: string
}

/** 只追加与归属读取的 Repository；没有更新或删除接口。 */
export interface MysqlEnvironmentSnapshotRepository {
  /** 在调用方事务内追加；重复引用或清单明确拒绝，不覆盖历史。 */
  readonly append: (transaction: MysqlTransactionContext<Mysql2QueryConnection>, record: EnvironmentSnapshotRecord) => Promise<void>
  /** 按用户、植物及快照三项联合读取；不存在或不归属均返回 null。 */
  readonly read: (userRef: string, userPlantRef: string, snapshotRef: string) => Promise<VerifiedEnvironmentSnapshot | null>
}

/** 数据库 VARCHAR(64) 结构限制；不是运营阈值。 */
function validateRef(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 64 || value.trim() !== value) {
    throw new TypeError('快照与归属引用不满足数据结构')
  }
}

/** BIGINT UNSIGNED 与 JavaScript 安全整数交集，拒绝隐式数值转换。 */
function validateTime(value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError('快照时间必须为非负安全整数毫秒')
  }
}

/** 对读写共同执行结构检查；领域 Schema、发布和事实真实性由上游负责。 */
function validateRecord(record: EnvironmentSnapshotRecord): void {
  if (record === null || typeof record !== 'object' || Array.isArray(record)) {
    throw new TypeError('缺少养护环境快照')
  }
  for (const ref of [record.snapshotRef, record.userRef, record.userPlantRef, record.configurationSnapshotRef]) {
    validateRef(ref)
  }
  if (!Number.isInteger(record.careContextVersion) || record.careContextVersion <= 0 || record.careContextVersion > 4_294_967_295) {
    throw new TypeError('养护上下文版本必须满足数据库正整数约束')
  }
  for (const value of [record.evidenceWindowStartMs, record.evidenceWindowEndMs, record.generatedAtMs, record.validUntilMs]) {
    validateTime(value)
  }
  if (record.evidenceWindowEndMs < record.evidenceWindowStartMs || record.generatedAtMs < record.evidenceWindowEndMs || record.validUntilMs <= record.generatedAtMs) {
    throw new RangeError('快照证据时间、生成时间及有效期不一致')
  }
  if (record.inputManifest === null || typeof record.inputManifest !== 'object' || Array.isArray(record.inputManifest)) {
    throw new TypeError('快照输入清单必须为 JSON 对象')
  }
  serializeCanonicalJson(record.inputManifest)
}

/** mysql2 BIGINT 显式转换；随后由完整记录约束再次核验。 */
function readInteger(value: unknown): number {
  if (typeof value === 'number') {
    validateTime(value)
    return value
  }
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(value)) {
    throw new TypeError('快照数据库整数列异常')
  }
  const result = Number(value)
  validateTime(result)
  return result
}

/** 用现有连接来源建立实际参数化 MySQL 读写，不在函数启动时执行 DDL。 */
export function createMysqlEnvironmentSnapshotRepository(
  source: MysqlConnectionPoolPort<Mysql2QueryConnection>,
): MysqlEnvironmentSnapshotRepository {
  return {
    append: async (transaction, record) => {
      validateRecord(record)
      const manifest = serializeCanonicalJson(record.inputManifest)
      const sha = calculateCanonicalJsonSha256(record.inputManifest)
      const result = await transaction.connection.execute(
        `INSERT INTO care_environment_snapshots
        (snapshot_ref,user_internal_id,user_plant_internal_id,care_context_version,configuration_snapshot_ref,
         input_manifest_json,input_manifest_sha256,evidence_window_start_ms,evidence_window_end_ms,
         generated_at_ms,valid_until_ms,created_at_ms,updated_at_ms)
         SELECT ?,u.id,p.id,?,?,CAST(? AS JSON),?,?,?,?,?,?,?
         FROM users u JOIN user_plants p ON p.user_internal_id=u.id
         WHERE u.public_user_id=? AND p.public_user_plant_id=?`,
        [record.snapshotRef, record.careContextVersion, record.configurationSnapshotRef, manifest, sha,
          record.evidenceWindowStartMs, record.evidenceWindowEndMs, record.generatedAtMs, record.validUntilMs,
          record.generatedAtMs, record.generatedAtMs, record.userRef, record.userPlantRef],
      )
      if (result.affectedRows !== 1) {
        throw new Error('用户植物归属不存在，快照未写入')
      }
    },
    read: async (userRef, userPlantRef, snapshotRef) => {
      for (const ref of [userRef, userPlantRef, snapshotRef]) {
        validateRef(ref)
      }
      const rows = await withReadConnection(source, connection => connection.query(
        `SELECT s.snapshot_ref,s.care_context_version,s.configuration_snapshot_ref,s.input_manifest_json,
         s.input_manifest_sha256,s.evidence_window_start_ms,s.evidence_window_end_ms,
         s.generated_at_ms,s.valid_until_ms
         FROM care_environment_snapshots s JOIN users u ON u.id=s.user_internal_id
         JOIN user_plants p ON p.id=s.user_plant_internal_id AND p.user_internal_id=s.user_internal_id
         WHERE u.public_user_id=? AND p.public_user_plant_id=? AND s.snapshot_ref=?`,
        [userRef, userPlantRef, snapshotRef],
      ))
      const row = rows[0]
      if (!row) {
        return null
      }
      const inputManifest = (typeof row.input_manifest_json === 'string'
        ? JSON.parse(row.input_manifest_json) : row.input_manifest_json) as CanonicalJsonObject
      const record: EnvironmentSnapshotRecord = {
        snapshotRef: String(row.snapshot_ref), userRef, userPlantRef,
        careContextVersion: readInteger(row.care_context_version),
        configurationSnapshotRef: String(row.configuration_snapshot_ref), inputManifest,
        evidenceWindowStartMs: readInteger(row.evidence_window_start_ms),
        evidenceWindowEndMs: readInteger(row.evidence_window_end_ms),
        generatedAtMs: readInteger(row.generated_at_ms), validUntilMs: readInteger(row.valid_until_ms),
      }
      validateRecord(record)
      const sha = calculateCanonicalJsonSha256(inputManifest)
      if (sha !== row.input_manifest_sha256) {
        throw new Error('养护输入快照摘要不一致，拒绝回放')
      }
      return { ...record, inputManifestSha256: sha }
    },
  }
}
