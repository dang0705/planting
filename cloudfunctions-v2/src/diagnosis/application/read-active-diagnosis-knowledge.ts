import Ajv2020 from 'ajv/dist/2020.js'
import {
  runDatabaseTransaction,
  type DatabaseTransactionDriver,
  type TransactionExecutionContext
} from '../../foundation/database/transaction-runner.js'
import {
  createDiagnosisCandidatePreparation,
  type DiagnosisCandidateSchemas,
  type CandidateDependencyReader
} from './prepare-knowledge-candidate.js'
import {
  createDiagnosisKnowledgeReleaseLocker,
  type LockedDiagnosisKnowledgeRelease
} from '../domain/diagnosis-knowledge-release.js'
/** 范围及审核协议只能由受控接线明确提供，不能以平台或客户端默认值替代。 */
export interface ActiveDiagnosisKnowledgeInput {
  /** 本次诊断唯一兼容知识范围。 */ readonly bundleCode: string
  /** 明确批准的审核协议版本。 */ readonly reviewProtocolVersion: string
}
/** Repository确认当前活动关联与原审核后，仍须应用复核来源依赖。 */
export type ActiveDiagnosisKnowledgeRead =
  | {
      /** 原审核及单一活动指针已在事务中核验。 */ readonly status: 'active'
      /** 完整原样发布包，不是公开DTO。 */ readonly release: LockedDiagnosisKnowledgeRelease
      /** 本次活动指针版本，不能混用另一版。 */ readonly pointerVersion: number
    }
  | {
      /** 缺记录、损坏或版本/审核失效。 */ readonly status: 'unavailable'
    }
/** 可交给本次后续计算的内部知识快照，不代表已完成诊断。 */
export type ActiveDiagnosisKnowledgeResult =
  | {
      /** 原包及外部依赖已通过本次受控读取。 */ readonly status: 'knowledge_ready'
      /** 本次递归冻结的兼容包。 */ readonly release: LockedDiagnosisKnowledgeRelease
      /** 与原包对应的单一指针版本。 */ readonly pointerVersion: number
    }
  | {
      /** 准入不足，不提供模型自由生成兜底。 */ readonly status: 'unavailable'
    }
/** 专属运行知识查询端口，使用调用方短事务，不执行发布或业务写入。 */
export interface ActiveDiagnosisKnowledgeRepository<T extends TransactionExecutionContext> {
  /** 按范围读活动包、锁原审核，并当前读确认指针和关联没有改变。 */ readActive(
    tx: T,
    input: ActiveDiagnosisKnowledgeInput
  ): Promise<ActiveDiagnosisKnowledgeRead>
}
/** 正式来源Reader及审核协议由受控应用注入，不猜线上默认参数。 */
export interface ActiveDiagnosisKnowledgeDependencies<T extends TransactionExecutionContext> {
  /** 读取结束即释放锁，模型调用在该事务之外。 */ readonly driver: DatabaseTransactionDriver<T>
  /** 专属活动知识查询Repository。 */ readonly repository: ActiveDiagnosisKnowledgeRepository<T>
  /** 唯一受控候选及依赖Schema。 */ readonly schemas: DiagnosisCandidateSchemas
  /** 本次来源许可、适用性和题包兼容Reader。 */ readonly dependencyReader: (
    tx: T
  ) => CandidateDependencyReader
}
const validate = new Ajv2020({ strict: true }).compile<ActiveDiagnosisKnowledgeInput>({
  type: 'object',
  additionalProperties: false,
  required: ['bundleCode', 'reviewProtocolVersion'],
  properties: {
    bundleCode: { type: 'string', minLength: 1, maxLength: 96, pattern: '^\\S(?:[\\s\\S]*\\S)?$' },
    reviewProtocolVersion: {
      type: 'string',
      minLength: 1,
      maxLength: 48,
      pattern: '^\\S(?:[\\s\\S]*\\S)?$'
    }
  }
})
/** 获得完整兼容快照后结束事务；不创建结果、会话、建议或养护事实。 */
export function createReadActiveDiagnosisKnowledge<T extends TransactionExecutionContext>(
  deps: ActiveDiagnosisKnowledgeDependencies<T>
) {
  const lock = createDiagnosisKnowledgeReleaseLocker(deps.schemas.candidate)
  return async (input: unknown): Promise<ActiveDiagnosisKnowledgeResult> => {
    if (!validate(input)) {
      throw new TypeError('活动知识范围或审核协议非法')
    }
    const query = Object.freeze({ ...input })
    return runDatabaseTransaction(deps.driver, async tx => {
      const active = await deps.repository.readActive(tx, query)
      if (active.status !== 'active') {
        return { status: 'unavailable' as const }
      }
      const release = lock(active.release.package),
        p = release.package
      if (
        release.packageSha256 !== active.release.packageSha256 ||
        p.bundleCode !== query.bundleCode ||
        p.reviewProtocolVersion !== query.reviewProtocolVersion ||
        !Number.isInteger(active.pointerVersion) ||
        active.pointerVersion < 1 ||
        active.pointerVersion > 4294967295
      ) {
        return { status: 'unavailable' as const }
      }
      const prepared = await createDiagnosisCandidatePreparation(
        deps.schemas,
        deps.dependencyReader(tx)
      )(p.candidate)
      if (
        prepared.status !== 'prepared_for_review' ||
        prepared.contentSha256 !== p.candidateContentSha256
      ) {
        return { status: 'unavailable' as const }
      }
      return Object.freeze({
        status: 'knowledge_ready' as const,
        release,
        pointerVersion: active.pointerVersion
      })
    })
  }
}
