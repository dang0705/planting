import type { CanonicalJsonObject } from '../../foundation/json/canonical-json-sha256.js'
import type { LockedDiagnosisResultRecord } from '../domain/diagnosis-result-record.js'
/** 统一用户与路径会话归属查询；不从客户端接收平台主体或植物内部键。 */
export interface DiagnosisResultReadInput {
  /** 已由identity域验真的统一用户公开引用。 */ readonly userRef: string
  /** 当前请求的精确会话公开引用，不能换成最新会话。 */ readonly diagnosisRef: string
}
/** 内部查询结果只允许严格公开结果，不返回完整回放和审计。 */
export type DiagnosisResultReadResult =
  | {
      /** 已经验证本人归属、完整摘要与知识引用。 */ readonly status: 'found'
      /** 唯一公开结果投影，HTTP还须通过Schema检查。 */ readonly data: CanonicalJsonObject
    }
  | {
      /** 没有结果或已有记录暂不可用，不能临时生成。 */ readonly status: 'not_found' | 'unavailable'
    }
/** 已校验持久化记录的专属结果，不将存储快照作为公开DTO。 */
export type StoredDiagnosisResultQuery =
  | {
      /**
       * 当前主体拥有完整有效记录，允许应用选择公开投影。
       */
      readonly status: 'found'
      /**
       * 完整锁定记录仅供服务端，回放内容不得进入HTTP。
       */
      readonly record: LockedDiagnosisResultRecord
    }
  | {
      /**
       * 不存在、旧行、损坏或原知识不可用，禁止补算结果。
       */
      readonly status: 'not_found' | 'missing_record' | 'invalid_record' | 'unavailable'
    }
/** 持久化端口返回经过验证的内部结果，应用仅选择公开投影。 */
export interface DiagnosisResultQueryRepository {
  /** 同一SQL核验用户/植物/会话、历史结果与原知识包摘要。 */ readForUser(
    userRef: string,
    diagnosisRef: string
  ): Promise<StoredDiagnosisResultQuery>
}
/** 只读结果用例，不触发模型、计划、提醒、积分或事实写入。 */
export function createGetDiagnosisResult(repository: DiagnosisResultQueryRepository) {
  return async (input: DiagnosisResultReadInput): Promise<DiagnosisResultReadResult> => {
    const result = await repository.readForUser(input.userRef, input.diagnosisRef)
    if (result.status === 'found') {
      return { status: 'found', data: result.record.record.publicResult }
    }
    return { status: result.status === 'not_found' ? 'not_found' : 'unavailable' }
  }
}
