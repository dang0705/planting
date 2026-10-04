import { randomUUID } from 'node:crypto'
import {
  serializeCanonicalJson,
  type CanonicalJsonValue
} from '../../foundation/json/canonical-json-sha256.js'
import type { TransactionExecutionContext } from '../../foundation/database/transaction-runner.js'
import type {
  FixedQuestionMode,
  FixedQuestionReleaseResolution
} from '../domain/fixed-question-release.js'
import type { LockedQuestionPackageSnapshot } from '../domain/question-package-snapshot.js'
import type {
  PersistentQuestionSession,
  QuestionSnapshotRead
} from '../repository/mysql-diagnosis-question-snapshot-repository.js'
/** 平台无关身份已验证后的内部创建命令；客户端不能指定题包或新会话引用。 */
export interface CreateFixedQuestionSessionInput {
  /** 身份域解析的统一用户公开引用。 */
  readonly userRef: string
  /** 服务端必须在创建事务核验归属的长期植物引用。 */
  readonly userPlantRef: string
  /** 首版复用的固定症状入口。 */
  readonly mode: FixedQuestionMode
  /** 可信服务端UTC毫秒，不采用客户端日期。 */
  readonly startedAtMs: number
}
/** 内部创建结果，完整快照只能由后续公开投影白名单处理。 */
export type FixedQuestionSessionCreation =
  | {
      /** 已在原事务成功追加并读回。 */
      readonly status: 'created'
      /** 服务器产生的高熵公开引用。 */
      readonly diagnosisRef: string
      /** 同一事务读回的不可变题包。 */
      readonly snapshot: LockedQuestionPackageSnapshot
    }
  | {
      /** 没有可运行发布或归属对象不存在。 */
      readonly status: 'unavailable' | 'not_found'
    }
/** 创建的专属端口，不建立通用工作流或第二套事务设施。 */
interface FixedQuestionSessionDependencies<T extends TransactionExecutionContext> {
  /** 原事务读取并锁定已发布题包。 */
  readonly published: (
    tx: T,
    mode: FixedQuestionMode,
    nowMs: number
  ) => Promise<FixedQuestionReleaseResolution>
  /** 原事务归属核验并追加会话。 */
  readonly append: (tx: T, value: PersistentQuestionSession) => Promise<'created' | 'not_found'>
  /** 原事务立即读回，禁止另开连接读取未提交记录。 */
  readonly read: (
    tx: T,
    userRef: string,
    userPlantRef: string,
    diagnosisRef: string
  ) => Promise<QuestionSnapshotRead>
}
/** 不自行提交；调用方共享幂等事务必须包含发布、创建和首次响应。 */
export function createFixedQuestionSessionInTransaction<T extends TransactionExecutionContext>(
  deps: FixedQuestionSessionDependencies<T>
) {
  return async (
    tx: T,
    input: CreateFixedQuestionSessionInput
  ): Promise<FixedQuestionSessionCreation> => {
    if (
      !Number.isSafeInteger(input.startedAtMs) ||
      input.startedAtMs < 0 ||
      input.startedAtMs > 8_640_000_000_000_000
    ) {
      throw new TypeError('诊断创建时间非法')
    }
    const published = await deps.published(tx, input.mode, input.startedAtMs)
    if (published.status !== 'available') {
      return { status: 'unavailable' }
    }
    if (published.snapshot.snapshot.mode !== input.mode) {
      throw new Error('发布题包症状不匹配')
    }
    const diagnosisRef = `dia_${randomUUID().replaceAll('-', '')}`
    const appended = await deps.append(tx, {
      diagnosisRef,
      userRef: input.userRef,
      userPlantRef: input.userPlantRef,
      snapshot: published.snapshot,
      startedAtMs: input.startedAtMs
    })
    if (appended === 'not_found') {
      return { status: 'not_found' }
    }
    const read = await deps.read(tx, input.userRef, input.userPlantRef, diagnosisRef)
    if (
      read.status !== 'found' ||
      read.snapshot.snapshotSha256 !== published.snapshot.snapshotSha256 ||
      serializeCanonicalJson(read.snapshot.snapshot as unknown as CanonicalJsonValue) !==
        serializeCanonicalJson(published.snapshot.snapshot as unknown as CanonicalJsonValue)
    ) {
      throw new Error('新建诊断题包读回不一致')
    }
    return { status: 'created', diagnosisRef, snapshot: read.snapshot }
  }
}
