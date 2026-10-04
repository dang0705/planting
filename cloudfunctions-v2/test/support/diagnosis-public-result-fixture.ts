/** 来自已冻结公开Schema的结构场景，不证明园艺知识真实或已审核。 */
export const diagnosisPublicResultFixture = {
  contractVersion: 'diagnosis-result/v1',
  titleZh: '叶尖受损，原因仍需核对',
  summaryZh: '目前只看到叶尖局部变化，不能仅凭这张照片确认病因。',
  problemType: '养护或环境相关问题',
  causeCategory: '待判定',
  certaintyLevel: 'unconfirmed',
  certaintyReasonZh: '缺少叶背、盆土和近期养护信息。',
  severityLevel: 'unknown',
  severityReasonZh: '现有画面不能判断整株受损范围，受损程度暂无法分级。',
  urgencyLevel: 'unknown',
  urgencyReasonZh: '现有画面不能判断整株受损范围。',
  isolationDecision: 'undetermined',
  isolationReasonZh: '没有观察到叶背与其他叶片，暂不能判断传染风险。',
  evidenceFindings: [
    {
      observationZh: '画面中的叶尖有局部干枯。',
      affectedPartZh: '叶尖',
      sourceType: 'image',
      direction: 'supports',
      coverageZh: '仅覆盖所拍摄叶片的正面。'
    }
  ],
  evidenceLimitations: [
    {
      limitationZh: '未拍摄叶背。',
      impactZh: '无法检查叶背虫体或病斑。',
      nextEvidenceZh: '补拍受损叶片的叶背。'
    }
  ],
  missingEvidence: [{ needZh: '近期浇水与盆土状态', reasonZh: '用于区分水分压力与其他原因。' }],
  alternativeOutcomes: [],
  recommendedActions: [
    {
      displayCategory: 'immediate',
      titleZh: '先检查受损叶片和盆土',
      purposeZh: '补充会改变结论的证据。',
      stepsZh: ['检查叶背，并记录盆土表面状态。'],
      selectionReasonZh: '现有证据不足，优先补充观察。',
      applicabilityZh: '仅适用于用户能安全观察到的叶片和盆土表面。',
      riskLevel: 'low',
      safetyNotesZh: [],
      contraindicationsZh: [],
      stopConditionsZh: ['发现迅速扩大的损伤时停止按原结论处理并重新问诊。'],
      followUpZh: '观察新叶是否继续出现类似损伤。',
      publicSources: [
        {
          sourceTypeZh: '园艺机构资料',
          titleZh: '经审核的检查建议示例',
          applicabilityZh: '支持先补充观察，再选择具体处置。'
        }
      ],
      requiresUserConfirmation: true
    }
  ],
  followUp: {
    observationsZh: ['新叶和其他叶片是否出现同类变化。'],
    escalationZh: '若损伤快速扩大，应重新诊断。'
  },
  publicSources: [
    {
      sourceTypeZh: '园艺机构资料',
      titleZh: '经审核资料示例',
      applicabilityZh: '仅用于说明证据局限和补充观察的必要性。'
    }
  ],
  knowledgeVersionZh: '诊断知识示例版本 v1'
}
