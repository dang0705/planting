import { formatDecisionGovernance } from './labels.js'
import { formatSymptomClassSummary } from './route-format.js'
import { formatDetailLines } from './basic-format.js'
import {
  getDerivedEvidenceLabels,
  getDiagnosisDirectionLabels,
  getObservedEvidenceLabels,
  getObservedSymptomLabels,
  getQuestionPackageSnapshotLabels,
  getVisualCandidateLabels
} from './record-format.js'

export function getCoreProcessFieldRows(detail = null) {
  return [
    {
      key: 'symptomClass',
      label: '症状模式',
      meaning: '症状分类是症状池与问题簇之间的门控层，决定可触发的问题族与默认优先级。',
      value: formatSymptomClassSummary(detail?.symptomClass)
    },
    {
      key: 'visual.visualCandidateSymptoms',
      label: '视觉候选症状',
      meaning: 'Hunyuan 和归一化层已经识别到、但尚未经过问诊确认进入正式证据层的视觉候选。',
      value: formatDetailLines(getVisualCandidateLabels(detail), '尚无视觉候选')
    },
    {
      key: 'visual.latestVisualCallBatchId',
      label: '视觉批次 ID',
      meaning: '本次诊断进入主链的视觉识别批次，用于回查原始 AI 返回和归一化结果。',
      value:
        detail?.coreProcess?.visual?.latestVisualCallBatchId ||
        detail?.latestVisualCallBatchId ||
        '无'
    },
    {
      key: 'evidence.observedSymptoms',
      label: '观察症状',
      meaning: '由正式证据集合投射出的症状，不等同于模型原始候选。',
      value: formatDetailLines(getObservedSymptomLabels(detail), '尚无观察症状')
    },
    {
      key: 'evidence.observedEvidenceSet',
      label: '正式证据集合',
      meaning: '已通过 admission 或问答回流进入诊断主链的事实层证据。',
      value: formatDetailLines(getObservedEvidenceLabels(detail), '尚无正式证据')
    },
    {
      key: 'evidence.derivedEvidenceSet',
      label: '模式证据',
      meaning: '从正式证据抽取出的模式/分布信息，只能辅助方向形成，不能单独裁决。',
      value: formatDetailLines(getDerivedEvidenceLabels(detail), '尚无模式证据')
    },
    {
      key: 'evidence.diagnosisDirections',
      label: '诊断方向',
      meaning: '系统根据证据形成的候选方向及可输出问题集合。',
      value: formatDetailLines(getDiagnosisDirectionLabels(detail), '尚无诊断方向')
    },
    {
      key: 'questions.questionPackageSnapshot',
      label: '题目队列',
      meaning: '本轮题目队列；完成后可能为空，应结合下方答题记录查看历史题目。',
      value: formatDetailLines(getQuestionPackageSnapshotLabels(detail), '本轮无可用题目')
    },
    {
      key: 'decision.outputEligibility',
      label: '输出资格',
      meaning: '最终是否允许输出结论，以及若不允许时的原因。',
      value: formatDecisionGovernance(detail)
    }
  ]
}
