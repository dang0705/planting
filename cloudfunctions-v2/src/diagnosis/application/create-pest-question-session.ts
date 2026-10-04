import { randomUUID } from 'node:crypto'
import {
  serializeCanonicalJson,
  type CanonicalJsonObject,
  type CanonicalJsonValue
} from '../../foundation/json/canonical-json-sha256.js'
import type { TransactionExecutionContext } from '../../foundation/database/transaction-runner.js'
import type {
  DynamicPestQuestionRelease,
  DynamicPestReleaseResolution
} from '../domain/dynamic-pest-release.js'
import {
  selectV1PestQuestionSnapshot,
  type PestQuestionTier
} from '../domain/pest-question-eligibility.js'
import { validateDiagnosisModelOutput } from '../domain/validate-diagnosis-model-output.js'
import {
  validateDiagnosisModelBinding,
  type DiagnosisModelBinding
} from '../domain/diagnosis-model-binding.js'
import type { FixedQuestionSessionCreation } from './create-fixed-question-session.js'
import type {
  PersistentQuestionSession,
  QuestionSnapshotRead
} from '../repository/mysql-diagnosis-question-snapshot-repository.js'
import type {
  OwnedVisualEvidenceRead,
  OwnedVisualEvidenceQuery
} from '../repository/mysql-owned-visual-evidence-reader.js'
import type {
  OwnedDiagnosisAssetRead,
  PersistentDiagnosisVisualEvidence
} from '../repository/mysql-diagnosis-visual-evidence-repository.js'
/** 服务端受控创建命令，客户端不能授予可信分析准备状态。 */
export interface CreatePestQuestionSessionInput {
  /** 身份域解析的统一用户公开引用。 */ readonly userRef: string
  /** 当前用户明确选择的长期植物引用。 */ readonly userPlantRef: string
  /** 已经归属该植物的私有诊断资产引用。 */ readonly assetRef: string
  /** 可信服务端UTC毫秒，不使用客户端日期。 */ readonly startedAtMs: number
}
/** 此结果必须由受控适配器验证版本和准入策略；本类型不是模型或客户端DTO。 */
export type PreparedPestAnalysis =
  | {
      /** 缺已发布模型、成本、档位或语义准入时拒绝准备。 */
      readonly status: 'unavailable'
    }
  | {
      /** 上游受控准入完成，不允许由HTTP自行标记。 */ readonly status: 'admitted'
      /** 实际调用所锁定的模型、提示词摘要与输出合同组合。 */ readonly modelBinding: DiagnosisModelBinding
      /** 分析准备消费的题包发布，必须与本次事务锁定的发布相同。 */ readonly questionPackageReleaseRef: string
      /** 分析所针对的确切私有资产内容摘要。 */ readonly assetContentSha256: string
      /** 本次图片明确采集的植物区域。 */ readonly evidenceKind:
        | 'leaf'
        | 'stem'
        | 'soil_surface'
        | 'whole_plant'
      /** 上游已批准策略得到的档位，不推导模型浮点或离散置信度。 */ readonly tier: PestQuestionTier
      /** 已审核语义归一后的候选顺序。 */ readonly candidateModes: readonly string[]
      /** 已审核归一后的观察键，不直接取模型局部证据键。 */ readonly lockedEvidenceKeys: readonly string[]
      /** 通过唯一已确认结构合同的视觉输出。 */ readonly output: CanonicalJsonObject
      /** 已发布保留策略提供的到期时间，没有本地默认。 */ readonly expiresAtMs: number
    }
/** 正题数复用既有创建结果；零题不创建会话且不产生诊断。 */
export type PestQuestionSessionCreation =
  | FixedQuestionSessionCreation
  | {
      /** 无待问问题，后续结论用例须独立准入。 */
      readonly status: 'no_questions'
    }
/** 仅编排本次业务事务，不新建通用引擎或另外一套账本。 */
interface PestQuestionSessionDependencies<T extends TransactionExecutionContext> {
  /** 同一事务锁定不可变虫害发布。 */ readonly published: (
    tx: T,
    nowMs: number
  ) => Promise<DynamicPestReleaseResolution>
  /** 同一事务锁定当前用户植物的私有资产。 */ readonly asset: (
    tx: T,
    input: CreatePestQuestionSessionInput
  ) => Promise<OwnedDiagnosisAssetRead>
  /** 读取已完成的受控分析；禁止在事务内调用外部模型或自行批准策略。 */ readonly prepare: (
    tx: T,
    input: CreatePestQuestionSessionInput,
    release: DynamicPestQuestionRelease,
    asset: OwnedDiagnosisAssetRead
  ) => Promise<PreparedPestAnalysis>
  /** 创建具有完整选定题包的会话，保持019约束。 */ readonly append: (
    tx: T,
    value: PersistentQuestionSession
  ) => Promise<'created' | 'not_found'>
  /** 原事务关联已有资产，保存结构化视觉证据。 */ readonly appendVisual: (
    tx: T,
    value: PersistentDiagnosisVisualEvidence
  ) => Promise<'created' | 'not_found'>
  /** 原事务读回题包，不读取未提交的第二连接。 */ readonly read: (
    tx: T,
    userRef: string,
    userPlantRef: string,
    diagnosisRef: string
  ) => Promise<QuestionSnapshotRead>
  /** 原事务读回绑定到新会话的视觉证据。 */ readonly readVisual: (
    tx: T,
    input: OwnedVisualEvidenceQuery
  ) => Promise<OwnedVisualEvidenceRead>
}
/** 发布、归属、所选题包、视觉保存与读回必须由调用方共享幂等事务共同提交。 */
export function createPestQuestionSessionInTransaction<T extends TransactionExecutionContext>(
  deps: PestQuestionSessionDependencies<T>
) {
  return async (
    tx: T,
    input: CreatePestQuestionSessionInput
  ): Promise<PestQuestionSessionCreation> => {
    const stable = Object.freeze({ ...input })
    if (
      !Number.isSafeInteger(stable.startedAtMs) ||
      stable.startedAtMs < 0 ||
      stable.startedAtMs > 8_640_000_000_000_000
    ) {
      throw new TypeError('虫害会话创建时间非法')
    }
    const published = await deps.published(tx, stable.startedAtMs)
    if (published.status !== 'available') {
      return { status: 'unavailable' }
    }
    const asset = await deps.asset(tx, stable)
    if (asset.status !== 'found') {
      return { status: asset.status === 'not_found' ? 'not_found' : 'unavailable' }
    }
    const prepared = await deps.prepare(tx, stable, published.release, asset)
    if (prepared.status !== 'admitted') {
      return { status: 'unavailable' }
    }
    const frozen = JSON.parse(
      serializeCanonicalJson(prepared as unknown as CanonicalJsonValue)
    ) as Extract<PreparedPestAnalysis, { status: 'admitted' }>
    const output = validateDiagnosisModelOutput(frozen.output)
    if (
      !validateDiagnosisModelBinding(frozen.modelBinding) ||
      frozen.questionPackageReleaseRef !== published.release.releaseRef ||
      frozen.assetContentSha256 !== asset.contentSha256 ||
      asset.assetRef !== stable.assetRef ||
      output.status !== 'valid' ||
      !Number.isSafeInteger(frozen.expiresAtMs) ||
      frozen.expiresAtMs <= stable.startedAtMs ||
      frozen.expiresAtMs > 8_640_000_000_000_000 ||
      !['leaf', 'stem', 'soil_surface', 'whole_plant'].includes(frozen.evidenceKind)
    ) {
      throw new TypeError('虫害分析准备与资产或合同不匹配')
    }
    const groups = frozen.lockedEvidenceKeys.map(key =>
      Object.hasOwn(published.release.evidenceGroupByKey, key)
        ? published.release.evidenceGroupByKey[key]!
        : key
    )
    const selection = selectV1PestQuestionSnapshot({
      questions: published.release.questions,
      candidateModes: frozen.candidateModes,
      lockedEvidenceKeys: frozen.lockedEvidenceKeys,
      lockedEvidenceGroups: groups,
      directMatchedModes: [],
      evidenceGroupByKey: published.release.evidenceGroupByKey,
      tier: frozen.tier,
      limits: published.release.tierQuestionLimits,
      questionPackageReleaseRef: published.release.releaseRef
    })
    if (selection.status === 'no_questions') {
      return { status: 'no_questions' }
    }
    const diagnosisRef = `dia_${randomUUID().replaceAll('-', '')}`,
      evidenceRef = `dve_${randomUUID().replaceAll('-', '')}`
    if (
      (await deps.append(tx, {
        diagnosisRef,
        userRef: stable.userRef,
        userPlantRef: stable.userPlantRef,
        snapshot: selection.snapshot,
        startedAtMs: stable.startedAtMs
      })) === 'not_found'
    ) {
      return { status: 'not_found' }
    }
    const visual = {
      diagnosisRef,
      evidenceRef,
      userRef: stable.userRef,
      userPlantRef: stable.userPlantRef,
      assetRef: stable.assetRef,
      assetContentSha256: asset.contentSha256,
      evidenceKind: frozen.evidenceKind,
      output: output.output,
      createdAtMs: stable.startedAtMs,
      expiresAtMs: frozen.expiresAtMs
    }
    if ((await deps.appendVisual(tx, visual)) !== 'created') {
      throw new Error('新会话视觉证据保存失败')
    }
    const read = await deps.read(tx, stable.userRef, stable.userPlantRef, diagnosisRef)
    const readVisual = await deps.readVisual(tx, {
      userRef: stable.userRef,
      userPlantRef: stable.userPlantRef,
      diagnosisRef,
      evidenceRef,
      modelContractVersion: 'diagnosis-model-output/v1',
      capturedAtMs: stable.startedAtMs
    })
    if (
      read.status !== 'found' ||
      read.snapshot.snapshotSha256 !== selection.snapshot.snapshotSha256 ||
      serializeCanonicalJson(read.snapshot.snapshot as unknown as CanonicalJsonValue) !==
        serializeCanonicalJson(selection.snapshot.snapshot as unknown as CanonicalJsonValue) ||
      readVisual.status !== 'found' ||
      readVisual.evidenceRef !== evidenceRef ||
      readVisual.evidenceKind !== frozen.evidenceKind ||
      readVisual.modelContractVersion !== 'diagnosis-model-output/v1' ||
      serializeCanonicalJson(readVisual.output) !== serializeCanonicalJson(output.output)
    ) {
      throw new Error('虫害会话题包或视觉读回不一致')
    }
    return { status: 'created', diagnosisRef, snapshot: read.snapshot }
  }
}
