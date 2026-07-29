'use strict'

const {
  PEST_MODE_LABELS,
  buildSpecificPestObservedEvidenceSet
} = require('./pest-question-package')
const { LOCKED_SPECIFIC_PEST_MODES } = require('../domain/diagnosis-mode-router')
const { PEST_CATEGORY } = require('../domain/diagnosis-mode-registry')

const HONEYDEW_EXPLANATION = '小虫可能留下甜黏的透明分泌物（也叫蜜露）。'
const FIRST_ITEM_INDEX = 0
const EMPTY_COUNT = 0
const SINGLE_OUTCOME_COUNT = 1

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeMode(value = '') {
  return normalizeText(value).toLowerCase()
}

function uniqueModes(modes = []) {
  return Array.from(
    new Set((Array.isArray(modes) ? modes : []).map(normalizeMode).filter(Boolean))
  ).filter(mode => LOCKED_SPECIFIC_PEST_MODES.includes(mode))
}

function normalizeAnswerMap(answers = []) {
  return new Map(
    (Array.isArray(answers) ? answers : [])
      .map(item => [normalizeText(item?.questionKey), normalizeText(item?.optionKey).toLowerCase()])
      .filter(([questionKey, optionKey]) => questionKey && optionKey)
  )
}

function collectLockedModes(hiddenPrefilledEvidence = []) {
  return uniqueModes(
    (Array.isArray(hiddenPrefilledEvidence) ? hiddenPrefilledEvidence : [])
      .filter(item => item?.routeEvidenceRole === 'direct_match')
      .flatMap(item => [
        item?.diagnosisMode,
        item?.diagnosis_mode,
        item?.modeKey,
        item?.evidenceKey,
        item?.symptomKey
      ])
  )
}

// dispatch-20260726 consolidated rework: 识别 direct tier 锁定的模式。
// directEvidenceLedgerForDirectResult 为 >=0.95 模型直判候选合成 direct_match evidence 时，
// 会附加 suppressEquivalentQuestion + lockedInQuestionnaire 标记。
// 这些标记表示该 mode 是模型高置信直判，confidenceLevel 应为 'high' 而非 'normal'。
function collectDirectTierLockedModes(hiddenPrefilledEvidence = []) {
  return uniqueModes(
    (Array.isArray(hiddenPrefilledEvidence) ? hiddenPrefilledEvidence : [])
      .filter(
        item =>
          item?.routeEvidenceRole === 'direct_match' &&
          item?.suppressEquivalentQuestion === true &&
          item?.lockedInQuestionnaire === true
      )
      .flatMap(item => [
        item?.diagnosisMode,
        item?.diagnosis_mode,
        item?.modeKey,
        item?.evidenceKey,
        item?.symptomKey
      ])
  )
}

function collectAnsweredModeStates({ questionPackage = {}, answers = [] } = {}) {
  const answerMap = normalizeAnswerMap(answers)
  const positiveModes = new Set()
  const negativeModes = new Set()
  for (const question of Array.isArray(questionPackage?.packageQuestions)
    ? questionPackage.packageQuestions
    : []) {
    const questionKey = normalizeText(question?.questionKey)
    const optionKey = answerMap.get(questionKey)
    if (!optionKey || optionKey.includes('unknown') || optionKey.includes('unsure')) {
      continue
    }
    const option = (Array.isArray(question?.options) ? question.options : []).find(
      item => normalizeText(item?.optionKey || item?.optionId).toLowerCase() === optionKey
    )
    const modes = uniqueModes(option?.mapsToModes || question?.candidateModes || [])
    const value = Number(option?.value || 0)
    for (const mode of modes) {
      if (value > 0) {
        positiveModes.add(mode)
        negativeModes.delete(mode)
      } else if (value < 0 && !positiveModes.has(mode)) {
        negativeModes.add(mode)
      }
    }
  }
  return { positiveModes, negativeModes }
}

function hasStickyHoneydewAnswer(answers = []) {
  return (Array.isArray(answers) ? answers : []).some(
    item => normalizeText(item?.optionKey).toLowerCase() === 'surface_residue_sticky_yes'
  )
}

function hasUnknownAnswer(answers = []) {
  return (Array.isArray(answers) ? answers : []).some(item => {
    const optionKey = normalizeText(item?.optionKey).toLowerCase()
    return optionKey === 'unknown' || optionKey.includes('unknown') || optionKey.includes('unsure')
  })
}

function buildSpecificPestOutcome(mode = '', { probable = false } = {}) {
  const displayName = PEST_MODE_LABELS[mode] || mode
  const actionAdviceItems =
    mode === 'fungus_gnat'
      ? ['先减少盆土长期潮湿，清理表土落叶，并观察盆土附近小飞虫是否减少。']
      : ['先隔离植株，重点检查叶背、嫩梢和茎部，避免马上混用药剂。']
  return {
    outcomeKey: mode,
    problemKey: mode,
    outcomeType: 'problematic',
    outcomeCategory: 'pest',
    displayNameCn: probable ? `可能是${displayName}` : displayName,
    displayName: probable ? `可能是${displayName}` : displayName,
    summary:
      mode === 'fungus_gnat'
        ? `${probable ? '当前更接近' : '已保留'} ${displayName} 方向，线索集中在盆土小飞虫活动。`
        : `${probable ? '当前更接近' : '已保留'} ${displayName} 方向，线索来自视觉证据和补充回答。`,
    severity: 'medium',
    urgency: 'observe',
    actionAdviceItems,
    avoidAdviceItems: ['不要把普通黄叶或发蔫直接当作虫害原因处理。']
  }
}

function resolveSpecificPestAnswerResult({
  sessionId = '',
  round = 2,
  answers = [],
  questionPackage = {},
  probableModes = [],
  plantContext = {},
  visualAggregateResult = null
} = {}) {
  const lockedModes = collectLockedModes(questionPackage?.hiddenPrefilledEvidence || [])
  // dispatch-20260726 consolidated rework: 识别 >=0.95 模型直判锁定的模式，
  // 这些模式的 confidenceLevel 应为 'high'，而非普通 'normal'。
  const directTierLockedModes = collectDirectTierLockedModes(
    questionPackage?.hiddenPrefilledEvidence || []
  )
  const hasDirectTierLock = directTierLockedModes.length > EMPTY_COUNT
  const { positiveModes, negativeModes } = collectAnsweredModeStates({ questionPackage, answers })
  for (const mode of lockedModes) {
    positiveModes.add(mode)
  }
  const packageCandidateModes = uniqueModes(questionPackage?.candidateModes)
  const finalModes = uniqueModes([...positiveModes]).filter(mode => !negativeModes.has(mode))
  const provisionalModes = uniqueModes(probableModes).filter(mode => !negativeModes.has(mode))
  const unknownAdditionalFallbackMode = hasUnknownAnswer(answers)
    ? packageCandidateModes.find(
        mode =>
          !negativeModes.has(mode) && !finalModes.includes(mode) && !provisionalModes.includes(mode)
      ) || ''
    : ''
  const candidateFallbackMode =
    finalModes.length || provisionalModes.length || unknownAdditionalFallbackMode
      ? ''
      : packageCandidateModes[FIRST_ITEM_INDEX] || ''
  const hasUnconfirmedCandidateFallback = Boolean(
    unknownAdditionalFallbackMode || candidateFallbackMode
  )
  const visibleModes = uniqueModes([
    ...finalModes,
    ...provisionalModes,
    ...(unknownAdditionalFallbackMode ? [unknownAdditionalFallbackMode] : []),
    ...(candidateFallbackMode ? [candidateFallbackMode] : [])
  ])
  const visibleOutcomes = visibleModes.map(mode =>
    buildSpecificPestOutcome(mode, {
      probable:
        (provisionalModes.includes(mode) && !finalModes.includes(mode)) ||
        (mode === unknownAdditionalFallbackMode && !finalModes.includes(mode)) ||
        (mode === candidateFallbackMode && !finalModes.includes(mode))
    })
  )
  const unconfirmedFallbackMode = candidateFallbackMode || unknownAdditionalFallbackMode
  const primary = visibleOutcomes[FIRST_ITEM_INDEX] || null
  const hasOutcomes = visibleOutcomes.length > EMPTY_COUNT
  const hasMultipleVisibleOutcomes = visibleOutcomes.length > SINGLE_OUTCOME_COUNT
  const canRefinePestCandidates =
    provisionalModes.length > EMPTY_COUNT && hasMultipleVisibleOutcomes
  const probableSummaryMode = unconfirmedFallbackMode || provisionalModes[FIRST_ITEM_INDEX] || ''
  const probableSummaryLabel = PEST_MODE_LABELS[probableSummaryMode] || probableSummaryMode
  const directionChoices = canRefinePestCandidates
    ? [
        {
          modeKey: PEST_CATEGORY,
          directionKey: PEST_CATEGORY,
          familyKey: PEST_CATEGORY,
          category: PEST_CATEGORY,
          problemKey: PEST_CATEGORY,
          userDisplayName: '继续细分虫害方向',
          pestModeKeys: provisionalModes,
          directModeKeys: finalModes.filter(mode => LOCKED_SPECIFIC_PEST_MODES.includes(mode)),
          confirmationModeKeys: provisionalModes
        }
      ]
    : []
  const summary = hasOutcomes
    ? canRefinePestCandidates
      ? '当前图片支持多个虫害方向，其中部分仍需在结果页继续细分。'
      : !finalModes.length && probableSummaryMode
        ? `补充回答未能确认关键特征，当前仍按图片候选更接近 ${probableSummaryLabel}，需结合后续观察确认。`
        : `已根据虫害视觉线索和补充回答保留 ${visibleOutcomes.length} 个方向。`
    : '这次图片和回答还不能稳定判断具体虫害。'
  const stickyHoneydewAnswer = hasStickyHoneydewAnswer(answers)

  return {
    diagnosisSessionId: sessionId,
    roundId: `round_${round}`,
    plantContext,
    visualAggregateResult,
    routePrimaryAction: 'finalize',
    outcomeType: hasOutcomes ? 'problematic' : 'uncertain',
    sessionStatus: 'completed',
    questionRequired: false,
    questions: [],
    observedEvidenceSet: buildSpecificPestObservedEvidenceSet({
      candidateModes: visibleModes,
      sourceRecordId: 'specific_pest_answer_resolver'
    }),
    candidateModes: visibleModes,
    provisionalModes,
    candidateRefinementAvailable: canRefinePestCandidates,
    directionChoices,
    visibleOutcomes,
    outcomeMode: visibleOutcomes.length ? 'visible_outcomes' : '',
    topProblem: primary
      ? {
          problemId: primary.problemKey,
          displayName: primary.displayNameCn,
          summary: primary.summary,
          severity: primary.severity
        }
      : null,
    finalResult: {
      resultId: `${sessionId || 'diagnosis'}_${round}`,
      problemId: primary?.problemKey || '',
      problemKey: primary?.problemKey || '',
      displayName: primary?.displayNameCn || '',
      problemName: primary?.displayNameCn || '',
      summary,
      severity: primary?.severity || 'low',
      // dispatch-20260726 consolidated rework: >=0.95 模型直判锁定模式 confidenceLevel='high'，
      // 让模型高置信判断透传到 finalResult，不被普通 'normal' 压低。
      confidenceLevel: hasDirectTierLock
        ? 'high'
        : provisionalModes.length || hasUnconfirmedCandidateFallback
          ? 'low'
          : hasOutcomes
            ? 'normal'
            : 'low',
      outcomeType: hasOutcomes ? 'problematic' : 'uncertain',
      visibleOutcomes,
      outcomeMode: visibleOutcomes.length ? 'visible_outcomes' : ''
    },
    summaryCard: {
      title: hasOutcomes
        ? provisionalModes.length
          ? '可能的虫害方向'
          : !finalModes.length && unconfirmedFallbackMode
            ? '可能的虫害方向'
            : '虫害方向已确认'
        : '暂不能判断具体虫害',
      subtitle: summary,
      severity: primary?.severity || 'low',
      statusText: hasOutcomes ? '已完成' : '需重新拍摄'
    },
    explanation: {
      whyItHappens: stickyHoneydewAnswer ? HONEYDEW_EXPLANATION : '',
      whatToCheckNext: hasOutcomes
        ? '继续观察这些虫害线索是否扩大。'
        : '建议重新拍清叶背、嫩梢或盆土表面。',
      firstAid: hasOutcomes ? '先隔离观察，并用清水轻柔冲洗明显虫体位置。' : '',
      avoid: '不要把虫害结果解释为黄叶或萎蔫的唯一原因。',
      reassurance: ''
    },
    nextSteps: hasOutcomes ? [{ text: '隔离植株并连续观察 3 天。' }] : [],
    whatToAvoid: ['不要在未确认前混用多种药剂。'],
    confidenceLevel: hasDirectTierLock
      ? 'high'
      : provisionalModes.length || hasUnconfirmedCandidateFallback
        ? 'low'
        : hasOutcomes
          ? 'normal'
          : 'low'
  }
}

module.exports = {
  HONEYDEW_EXPLANATION,
  resolveSpecificPestAnswerResult,
  _test: {
    collectAnsweredModeStates,
    collectLockedModes,
    collectDirectTierLockedModes,
    buildSpecificPestOutcome,
    hasStickyHoneydewAnswer,
    hasUnknownAnswer
  }
}
