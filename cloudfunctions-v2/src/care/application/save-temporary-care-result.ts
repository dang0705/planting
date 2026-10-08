import { runDatabaseTransaction, type DatabaseTransactionDriver } from '../../foundation/database/transaction-runner.js'
import type { MysqlTransactionContext } from '../../foundation/database/mysql-transaction-driver.js'
import type { Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'
import { serializeCanonicalJson, type CanonicalJsonValue, type CanonicalJsonObject } from '../../foundation/json/canonical-json-sha256.js'
import { lockTemporaryCareResult, type TemporaryCareResultRecord } from '../domain/temporary-care-result-record.js'
import type { MysqlTemporaryCareResultRepository } from '../repository/mysql-temporary-care-result-repository.js'

/** 既有事务和专属仓储，不能由客户端选择实现或连接。 */
export interface TemporaryCareSavePorts {
  /** 提交未知时由驱动销毁旧连接；本用例只做新连接核对。 */
  readonly driver: DatabaseTransactionDriver<MysqlTransactionContext<Mysql2QueryConnection>>
  /** 每次读取再次检查案例和会话的真实归属。 */
  readonly repository: MysqlTemporaryCareResultRepository
  /** 服务器当前UTC毫秒，不使用前端自报现在时间。 */
  readonly now: () => number
}

/** 内部应用用例结果；外部HTTP仍须经过既定认证、DTO和错误映射。 */
export type TemporaryCareSaveResult = {
  /** 已读回且内容与原请求一致。 */ readonly status: 'stored'
  /** 仅转发上游已经准入的脱敏结果，不返回输入和内部发布引用。 */ readonly result: CanonicalJsonObject
} | {
  /** 原引用冲突、归属缺失或暂无法确定保存结果。 */ readonly status: 'conflict' | 'not_found' | 'unavailable'
}

/**
 * 保存已计算且已准入的临时结果，不能以存储成功代替算法发布。
 * 上游负责凭证、内容Schema、配置和模型准入；本用例锁定输入、事务保存并读回原结果。
 * 相同服务端结果引用可核对重放；这不替代未来HTTP的Idempotency-Key登记。
 */
export async function saveTemporaryCareResult(ports: TemporaryCareSavePorts, input: TemporaryCareResultRecord): Promise<TemporaryCareSaveResult> {
  const locked = lockTemporaryCareResult(input)
  const expected = serializeCanonicalJson(locked as unknown as CanonicalJsonValue)
  const read = () => ports.repository.read(locked.owner, locked.sessionRef, locked.resultRef, ports.now())
  const resolve = (found: Awaited<ReturnType<typeof read>>): TemporaryCareSaveResult => {
    if (found.status !== 'found') { return { status: 'unavailable' } }
    if (serializeCanonicalJson(found.record as unknown as CanonicalJsonValue) !== expected) { return { status: 'conflict' } }
    return { status: 'stored', result: found.record.result }
  }
  try {
    const existing = await read()
    if (existing.status !== 'not_found') { return resolve(existing) }
    try {
      const written = await runDatabaseTransaction(ports.driver, tx => ports.repository.append(tx, locked))
      if (written === 'not_found') { return { status: 'not_found' } }
    } catch {
      // 同引用并发、回滚故障或提交未知均只核对一次，不盲重发、不披露数据库错误。
      return resolve(await read())
    }
    return resolve(await read())
  } catch {
    return { status: 'unavailable' }
  }
}
