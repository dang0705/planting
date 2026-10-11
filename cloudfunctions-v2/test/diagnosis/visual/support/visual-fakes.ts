import fs from 'node:fs'
import path from 'node:path'

import type { DiagnosisVisualGenerationRules } from '../../../../src/configuration/business-policies/index.js'
import type { UserPrincipalDto } from '../../../../src/contracts/types.js'
import type { VisualPromptRelease } from '../../../../src/diagnosis/visual/application/visual-ports.js'
import { findProjectRoot } from '../../../support/project-root.js'

/**
 * 视觉诊断用例的测试夹具（unit_fake）：策略正文取自真实发布文档 diagnosis.visual_generation.v1.release.json，
 * 其余依赖（仓储、额度、存储、模型）在各用例里用内存假实现替换。
 */
export const fixtureNow = Date.UTC(2026, 9, 11, 8, 0, 0)

/** 真实发布文档里的策略正文。 */
export const generationRules = (
  JSON.parse(
    fs.readFileSync(
      path.join(
        findProjectRoot(),
        'cloudfunctions-v2/models/policy-releases/diagnosis.visual_generation.v1.release.json'
      ),
      'utf8'
    )
  ) as { policy: DiagnosisVisualGenerationRules }
).policy

/** 策略快照。 */
export const generationSnapshot = {
  rules: generationRules,
  schemaVersion: 'diagnosis-visual-generation/v1',
  releaseRef: 'bpr_fixture_visual_0001',
  releaseVersion: 'diagnosis-visual-generation/v1.0.0',
  contentSha256: 'a'.repeat(64)
}

/** 提示词发布（测试用短前缀）。 */
export const promptRelease: VisualPromptRelease = {
  prefixText: '固定前缀（测试）',
  // 与策略发布文档 promptRelease 登记的摘要一致（运行时按摘要取发布）。
  promptReleaseSha256: (
    generationRules as unknown as { promptRelease: { promptReleaseSha256: string } }
  ).promptRelease.promptReleaseSha256,
  outputSchemaVersion: 'diagnosis-visual-gen-output/v1',
  agentAllowlistVersion: 'diagnosis-visual-gen-agent-allowlist/v1',
  causeCatalog: ['pest_whitefly', 'none_no_obvious_problem'],
  strictOutputSchema: null
}

/** 登录主体。 */
export const ownerPrincipal: UserPrincipalDto = {
  principalType: 'user',
  user_id: 'usr_visual_owner_0001',
  sessionVersion: 1,
  authenticatedVia: 'wechat',
  issuedAt: '2026-10-11T00:00:00Z',
  expiresAt: '2026-10-12T00:00:00Z'
} as UserPrincipalDto

/** 能力快照（只含本测试关心的字段）。 */
export function capabilitySnapshot(capabilities: readonly string[]) {
  return {
    subjectType: 'user',
    user_id: ownerPrincipal.user_id,
    tier: 'trial',
    allowedCapabilities: [...capabilities],
    rewardedAiScopes: [],
    activeUserPlantLimit: 5
  } as never
}

/** 合法模型输出（通过安全门）。 */
export const validModelText = JSON.stringify({
  contractVersion: 'diagnosis-visual-gen-output/v1',
  classification: {
    isPlant: 'yes',
    usable: 'good',
    qualityIssues: [],
    overallStatus: 'problem_found',
    candidates: [
      { rank: 1, causeCode: 'pest_whitefly', certaintyBand: 'likely', directMarkerKeys: [] }
    ],
    severity: 'mild',
    urgency: 'soon',
    isolation: 'uncertain'
  },
  perImage: [{ imageIndex: 1, visiblePart: 'leaf_back', quality: 'good', noteZh: '清晰' }],
  titleZh: '白粉虱虫害',
  summaryZh: '较可能是白粉虱。',
  diagnosisTable: {
    problemTypeZh: '虫害',
    certaintyReasonZh: '看到虫体',
    mainEvidenceZh: '叶背白虫',
    urgencyZh: '尽快',
    isolationZh: '暂不确定'
  },
  identificationBasis: [{ aspectZh: '虫体', detailZh: '叶背白虫', imageIndex: 1 }],
  alternatives: [],
  immediateActions: [
    {
      stepNo: 1,
      titleZh: '隔离',
      detailZh: '搬开',
      causeCodes: ['pest_whitefly'],
      riskLevel: 'low',
      agentNames: []
    }
  ],
  ongoingCare: [
    {
      stepNo: 1,
      titleZh: '通风',
      detailZh: '放在通风处',
      causeCodes: ['pest_whitefly'],
      careProposalKind: 'ventilation',
      agentNames: []
    }
  ],
  prevention: [],
  cautions: [],
  followUp: { recheckZh: '几天后复查', escalateZh: '不降时线下核验' },
  retakeRequests: []
})

/** 非植物输出（释放不扣点）。 */
export const notPlantModelText = JSON.stringify({
  ...JSON.parse(validModelText),
  classification: {
    ...JSON.parse(validModelText).classification,
    isPlant: 'no',
    usable: 'unusable',
    overallStatus: 'not_plant',
    candidates: [],
    qualityIssues: ['not_plant']
  },
  perImage: [{ imageIndex: 1, visiblePart: 'unknown', quality: 'unusable', noteZh: '不是植物' }],
  identificationBasis: [],
  immediateActions: [],
  ongoingCare: []
})
