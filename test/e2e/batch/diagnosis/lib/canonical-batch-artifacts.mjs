import fs from 'node:fs/promises'
import path from 'node:path'

export const MAX_BATCH_RESULTS_PER_FILE = 100

export function normalizeText(value = '', fallback = '') {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

function padTwoDigits(value) {
  return String(Math.max(0, Number(value) || 0)).padStart(2, '0')
}

export function formatLocalTimeBase(date = new Date()) {
  return `${date.getFullYear()}${padTwoDigits(date.getMonth() + 1)}${padTwoDigits(date.getDate())}-${padTwoDigits(date.getHours())}${padTwoDigits(date.getMinutes())}${padTwoDigits(date.getSeconds())}`
}

export function chunkArray(items = [], size = MAX_BATCH_RESULTS_PER_FILE) {
  const safeItems = Array.isArray(items) ? items : []
  const chunkSize = Math.max(1, Number(size) || 1)
  const chunks = []

  for (let index = 0; index < safeItems.length; index += chunkSize) {
    chunks.push(safeItems.slice(index, index + chunkSize))
  }

  return chunks
}

async function pathExists(targetPath = '') {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

function buildPartBaseName(rootBaseName = '', partIndex = 1, partCount = 1) {
  if (partCount <= 1) {
    return rootBaseName
  }
  return `${rootBaseName}-part${padTwoDigits(partIndex)}`
}

export async function allocateSplitArtifactPaths({
  batchArtifactsDir = '',
  conclusionArtifactsDir = '',
  completedAt = new Date(),
  baseName = '',
  partCount = 1
} = {}) {
  await fs.mkdir(batchArtifactsDir, { recursive: true })
  await fs.mkdir(conclusionArtifactsDir, { recursive: true })

  const normalizedBaseName = normalizeText(baseName, formatLocalTimeBase(completedAt))
  let suffixIndex = 0

  while (true) {
    const suffix = suffixIndex > 0 ? `-${padTwoDigits(suffixIndex)}` : ''
    const rootBaseName = `${normalizedBaseName}${suffix}`
    const partPaths = []
    let hasCollision = false

    for (let partIndex = 1; partIndex <= Math.max(1, Number(partCount) || 1); partIndex += 1) {
      const partBaseName = buildPartBaseName(rootBaseName, partIndex, partCount)
      const batchReportFileAbs = path.join(batchArtifactsDir, `${partBaseName}.json`)
      const conclusionFileAbs = path.join(conclusionArtifactsDir, `${partBaseName}-conclusion.json`)

      if (
        await pathExists(batchReportFileAbs) ||
        await pathExists(conclusionFileAbs)
      ) {
        hasCollision = true
        break
      }

      partPaths.push({
        rootBaseName,
        partBaseName,
        partIndex,
        partCount,
        batchReportFileAbs,
        conclusionFileAbs,
        batchReportFile: path.relative(process.cwd(), batchReportFileAbs),
        conclusionFile: path.relative(process.cwd(), conclusionFileAbs)
      })
    }

    if (!hasCollision) {
      return {
        rootBaseName,
        partCount: Math.max(1, Number(partCount) || 1),
        parts: partPaths
      }
    }

    suffixIndex += 1
  }
}

function _normalizeNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function roundNumber(value, digits = 4) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {return 0}
  return Number(parsed.toFixed(digits))
}

function formatNumber(value, digits = 3) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {return '0'}
  return String(Number(parsed.toFixed(digits)))
}

function _toDisplayList(items = [], formatter, emptyText = '无') {
  const safeItems = (Array.isArray(items) ? items : [])
    .map(item => formatter(item))
    .filter(Boolean)

  return safeItems.length ? safeItems.join('；') : emptyText
}

function formatVisualEvidenceText(visualFinalEvidence = []) {
  const safeEvidence = Array.isArray(visualFinalEvidence) ? visualFinalEvidence : []
  if (!safeEvidence.length) {
    return '本条没有进入正式证据层的视觉证据。'
  }

  const text = safeEvidence
    .slice(0, 4)
    .map(item => {
      const displayName = normalizeText(item?.symptomCn || item?.symptomKey, '未命名视觉证据')
      const confidence = formatNumber(item?.confidence, 2)
      return `“${displayName}”(置信度 ${confidence})`
    })
    .join('、')

  const suffix = safeEvidence.length > 4 ? ` 等 ${safeEvidence.length} 条` : ''
  return `正式进入证据层的视觉证据有 ${text}${suffix}。`
}

function formatSymptomClassText(symptomClassReplay = null) {
  if (!symptomClassReplay || typeof symptomClassReplay !== 'object') {
    return '本条没有形成可用的 symptom class 路由结果。'
  }

  const currentClassName = normalizeText(
    symptomClassReplay?.currentClassNameCn || symptomClassReplay?.currentClassKey
  )
  const currentGroup = normalizeText(
    symptomClassReplay?.currentGroupLabel || symptomClassReplay?.currentGroupKey
  )

  if (!currentClassName && !currentGroup) {
    return '本条没有形成可用的 symptom class 路由结果。'
  }

  const segments = []
  if (currentClassName) {
    segments.push(`症状模式收敛到“${currentClassName}”`)
  }
  if (currentGroup) {
    segments.push(`当前题组落在“${currentGroup}”`)
  }

  return `${segments.join('，')}。`
}

function formatRoundText(round = {}, fallbackLabel = '本轮') {
  const roundIndex = Number(round?.roundIndex || 0)
  const label = roundIndex > 0 ? `第${roundIndex}轮` : fallbackLabel
  const qas = Array.isArray(round?.qas) ? round.qas : []

  if (!qas.length) {
    return `${label}没有触发问诊。`
  }

  const pairs = qas.map(item => {
    const questionText = normalizeText(item?.questionText || item?.questionKey, '未命名问题')
    const answerText = normalizeText(item?.answer?.optionText, '未回答')
    return `问“${questionText}”，答“${answerText}”`
  })

  return `${label}共 ${qas.length} 题：${pairs.join('；')}。`
}

function formatReasonList(reasons = []) {
  const reasonMap = {
    top_score_low: '最高候选分不够高',
    score_gap_small: '前两名分差太小',
    too_many_unknowns: '关键题里“不确定”过多',
    visual_confidence_low: '视觉证据置信度偏低',
    no_high_value_questions: '已没有高价值追问可继续'
  }

  return (Array.isArray(reasons) ? reasons : [])
    .map(item => normalizeText(item))
    .filter(Boolean)
    .map(item => reasonMap[item] || item)
}

function formatLegalityReason(reason = '') {
  const reasonMap = {
    evidence_conflict_unresolved: '证据冲突仍未消解',
    input_unfillable: '当前输入条件不足，无法再安全补齐',
    no_high_value_question: '已经没有高价值追问可继续',
    user_interrupt: '用户主动中断',
    resource_limit: '达到资源限制'
  }
  const normalizedReason = normalizeText(reason)
  return reasonMap[normalizedReason] || normalizedReason
}

function summarizeRankingSnapshot(rankingSnapshot = []) {
  return (Array.isArray(rankingSnapshot) ? rankingSnapshot : [])
    .slice(0, 3)
    .map(item => ({
      rankNo: Number(item?.rankNo || 0),
      problemKey: normalizeText(item?.problemKey),
      displayName: normalizeText(item?.displayName || item?.problemCn || item?.problemKey),
      role: normalizeText(item?.role || item?.problemRole),
      visualEvidence: roundNumber(item?.visualEvidence),
      questionEvidence: roundNumber(item?.questionEvidence),
      totalEvidence: roundNumber(item?.totalEvidence),
      penalty: roundNumber(item?.penalty),
      genusCompatibility: roundNumber(item?.genusCompatibility),
      hostCompatibility: roundNumber(item?.hostCompatibility),
      baseScore: roundNumber(item?.baseScore),
      finalScore: roundNumber(item?.finalScore)
    }))
    .filter(item => item.problemKey || item.displayName)
}

function buildCompetitionText(topCandidates = [], metrics = null) {
  if (!topCandidates.length) {
    return '系统仍按固定公式完成了问题竞争，但当前产物里没有保留可展开的分数明细。'
  }

  const top = topCandidates[0]
  const second = topCandidates[1] || null
  const metricSuffix = metrics && typeof metrics === 'object'
    ? ` 当前可靠度 ${formatNumber(metrics?.reliabilityScore, 3)}，第一二名分差 ${formatNumber(metrics?.topScoreGap, 3)}。`
    : ''

  const secondText = second
    ? `第二名是“${second.displayName}”，最终分 ${formatNumber(second.finalScore, 3)}。`
    : '当前没有形成稳定的第二候选。'

  return [
    '系统先按“总证据 = 视觉证据 + 1.25 × 问诊证据”计算总证据，',
    '再按“基础分 = 总证据 × 属级系数 × 宿主系数 - 扣分”计算基础分，',
    '最后按“最终分 = 基础分 + 因果增强”做最终排序。',
    `本条当前第一名是“${top.displayName}”，最终分 ${formatNumber(top.finalScore, 3)}，其中视觉证据 ${formatNumber(top.visualEvidence, 3)}，问诊证据 ${formatNumber(top.questionEvidence, 3)}，扣分 ${formatNumber(top.penalty, 3)}。`,
    secondText + metricSuffix
  ].join('')
}

function buildOutcomeReasoning({
  outcome = {},
  topCandidates = [],
  decisionCause = null,
  lowConfidence = null
} = {}) {
  const outcomeType = normalizeText(outcome?.outcomeType)
  const stopReason = normalizeText(outcome?.stopReason)
  const decisionCauseText = normalizeText(decisionCause?.decisionCauseText)
  const decisionCauseKey = normalizeText(decisionCause?.decisionCauseKey)
  const legalityReason = formatLegalityReason(lowConfidence?.uncertainLegalityReason)
  const top = topCandidates[0] || null

  if (outcomeType === 'non_problematic') {
    return {
      whyThisOutcome: '最终收敛到“非问题性结论”，说明系统在问题竞争前就命中了非问题性规则，不再需要继续把异常硬解释成病害或养护问题。',
      whyNotOtherOutcomes: [
        '不是问题性结论，因为系统已经判定当前观察更符合“暂未见明显问题/正常变化”一侧。',
        '不是不确定结论，因为当前已有足够规则支持安全输出非问题性结果。'
      ],
      raw: {
        stopReason,
        decisionCauseKey,
        decisionCauseText
      }
    }
  }

  if (outcomeType === 'uncertain') {
    const uncertainReasonText = legalityReason || decisionCauseText || '当前证据不足以安全锁定具体 root cause。'
    const reasonList = formatReasonList(lowConfidence?.reasons)

    return {
      whyThisOutcome: `最终收敛到“不确定结论”，核心原因是：${uncertainReasonText}${reasonList.length ? `；同时存在 ${reasonList.join('、')}。` : ''}`,
      whyNotOtherOutcomes: [
        '不是问题性结论，因为当前缺少把某个具体问题安全输出为 final outcome 的条件。',
        '不是非问题性结论，因为系统没有命中非问题性规则。'
      ],
      raw: {
        stopReason,
        decisionCauseKey,
        decisionCauseText,
        uncertainLegalityReason: normalizeText(lowConfidence?.uncertainLegalityReason)
      }
    }
  }

  const topText = top
    ? `当前可输出的最高候选是“${top.displayName}”，最终分 ${formatNumber(top.finalScore, 3)}。`
    : '当前已形成问题性输出，但源数据里没有保留最终排名明细。'
  const second = topCandidates[1] || null
  const compareText = second
    ? `它压过了第二名“${second.displayName}”(最终分 ${formatNumber(second.finalScore, 3)})。`
    : ''

  return {
    whyThisOutcome: `最终收敛到“问题性结论”。${topText}${compareText} stopReason=${stopReason || 'problematic_output_ready'}。`,
    whyNotOtherOutcomes: [
      '不是非问题性结论，因为系统没有命中非问题性规则。',
      lowConfidence?.uncertainLegalityReason
        ? `不是直接走不确定结论，因为最终没有保留该不确定合法原因：${formatLegalityReason(lowConfidence.uncertainLegalityReason)}。`
        : '不是不确定结论，因为当前已经满足问题性输出的停止条件。'
    ],
    raw: {
      stopReason,
      decisionCauseKey,
      decisionCauseText
    }
  }
}

export function buildBatchCalculationProcess({
  sessionId = '',
  visualFinalEvidence = [],
  symptomClassReplay = null,
  round1 = null,
  round2 = null,
  outcome = null,
  rankingSnapshot = [],
  decisionCause = null,
  lowConfidence = null,
  metrics = null
} = {}) {
  const topCandidates = summarizeRankingSnapshot(rankingSnapshot)
  const outcomeReasoning = buildOutcomeReasoning({
    outcome,
    topCandidates,
    decisionCause,
    lowConfidence
  })

  const visualStep = formatVisualEvidenceText(visualFinalEvidence)
  const symptomClassStep = formatSymptomClassText(symptomClassReplay)
  const round1Step = formatRoundText(round1, '首轮')
  const round2Step = formatRoundText(round2, '第二轮')
  const competitionStep = buildCompetitionText(topCandidates, metrics)
  const convergenceStep = outcomeReasoning.whyThisOutcome

  return {
    sessionId: normalizeText(sessionId),
    easySummary: `${visualStep}${symptomClassStep}${round1Step}${round2Step}${convergenceStep}`,
    formulaGuide: {
      totalEvidence: '总证据 = 视觉证据 + 1.25 × 问诊证据',
      baseScore: '基础分 = 总证据 × 属级系数 × 宿主系数 - 扣分',
      finalScore: '最终分 = 基础分 + 因果增强'
    },
    steps: [
      {
        step: 1,
        title: '正式视觉证据',
        text: visualStep
      },
      {
        step: 2,
        title: '症状模式与题组路由',
        text: symptomClassStep
      },
      {
        step: 3,
        title: '第1轮问诊',
        text: round1Step
      },
      {
        step: 4,
        title: '第2轮问诊',
        text: round2Step
      },
      {
        step: 5,
        title: '问题竞争计算',
        text: competitionStep
      },
      {
        step: 6,
        title: 'outcome 收敛',
        text: convergenceStep
      }
    ],
    competitionTopCandidates: topCandidates,
    outcomeReasoning
  }
}

export function buildArtifactSplitMeta({
  rootBaseName = '',
  partIndex = 1,
  partCount = 1,
  maxResultsPerFile = MAX_BATCH_RESULTS_PER_FILE
} = {}) {
  return {
    rootBaseName: normalizeText(rootBaseName),
    partIndex: Number(partIndex || 1),
    partCount: Number(partCount || 1),
    maxResultsPerFile: Number(maxResultsPerFile || MAX_BATCH_RESULTS_PER_FILE)
  }
}

export async function writeSplitCanonicalBatchArtifacts({
  results = [],
  batchArtifactsDir = '',
  conclusionArtifactsDir = '',
  completedAt = new Date(),
  baseName = '',
  maxResultsPerFile = MAX_BATCH_RESULTS_PER_FILE,
  buildBatchReport,
  buildBatchConclusion
} = {}) {
  const resultChunks = chunkArray(results, maxResultsPerFile)
  const allocation = await allocateSplitArtifactPaths({
    batchArtifactsDir,
    conclusionArtifactsDir,
    completedAt,
    baseName,
    partCount: resultChunks.length || 1
  })

  const artifacts = []

  for (let index = 0; index < allocation.parts.length; index += 1) {
    const part = allocation.parts[index]
    const chunkResults = resultChunks[index] || []
    const splitMeta = buildArtifactSplitMeta({
      rootBaseName: allocation.rootBaseName,
      partIndex: part.partIndex,
      partCount: part.partCount,
      maxResultsPerFile
    })
    const batchReport = await buildBatchReport(chunkResults, {
      splitMeta,
      completedAt,
      rootBaseName: allocation.rootBaseName
    })
    const conclusion = await buildBatchConclusion(batchReport, part.batchReportFile, {
      splitMeta,
      completedAt,
      rootBaseName: allocation.rootBaseName
    })

    await fs.writeFile(
      part.batchReportFileAbs,
      `${JSON.stringify(batchReport, null, 2)}\n`,
      'utf8'
    )
    await fs.writeFile(
      part.conclusionFileAbs,
      `${JSON.stringify(conclusion, null, 2)}\n`,
      'utf8'
    )

    artifacts.push({
      ...part,
      splitMeta,
      batchReport,
      conclusion
    })
  }

  return {
    rootBaseName: allocation.rootBaseName,
    partCount: allocation.partCount,
    artifacts
  }
}
