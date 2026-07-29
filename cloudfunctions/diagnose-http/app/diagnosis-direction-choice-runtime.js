'use strict'

const {
  DIAGNOSIS_MODE_REGISTRY,
  PEST_CATEGORY,
  PEST_MODE_KEYS
} = require('../domain/diagnosis-mode-registry')
const { routeEvidenceLedger, routeFromAggregate, directEvidenceLedgerForDirectResult } = require('./pest-visual-orchestrator')
const {
  buildSpecificPestQuestionPackage,
  buildSpecificPestObservedEvidenceSet,
  PEST_MODE_LABELS
} = require('./pest-question-package')
const { resolveSpecificPestAnswerResult } = require('./specific-pest-answer-resolver')
const {
  SINGLE_SELECTED_MODE_COUNT,
  selectedDirectionKey,
  isDirectionChoicePayload,
  normalizeDirectionChoiceMode,
  directionChoicesFromRoute,
  directionChoicesFromState,
  findDirectionChoice,
  findDirectionChoiceInList,
  assertAllowedDirectionChoice,
  resolveAggregateForDirectionChoice,
  buildVisualAdmittedEvidenceLedger,
  mergeEvidenceLedgers,
  selectedPestModeKeysFromChoice,
  buildPestFallbackRouteResultFromChoice
} = require('./diagnosis-direction-choice-helpers')

function getDiagnosisEngine() {
  return require('../domain/diagnosis-engine')
}

function getBuildStaticQuestionPackageStartRoundResult() {
  return require('./static-question-package-start').buildStaticQuestionPackageStartRoundResult
}

const STATIC_MODE_OPTIONS = Object.freeze({
  yellow_leaf: Object.freeze({
    classKey: 'yellowing_mode',
    modeKey: 'yellow_leaf',
    classNameCn: '黄叶模式',
    symptomKey: 'uniform_yellowing',
    symptomCn: '整叶黄化'
  }),
  wilting_droop: Object.freeze({
    classKey: 'wilting_droop_mode',
    modeKey: 'wilting_droop',
    classNameCn: '枯萎 / 发蔫模式',
    symptomKey: 'wilting_droop',
    symptomCn: '枯萎 / 发蔫'
  })
})

function buildSelectedModeAggregate(aggregateResult = null, selectedModeKeys = []) {
  const routeResult = routeFromAggregate(aggregateResult) || {}
  const selectedSet = new Set(
    (Array.isArray(selectedModeKeys) ? selectedModeKeys : []).filter(Boolean)
  )
  const selectedDirectMatches = (
    Array.isArray(routeResult.directMatches) ? routeResult.directMatches : []
  ).filter(item => selectedSet.has(item?.modeKey))
  const selectedConfirmationCandidates = (
    Array.isArray(routeResult.confirmationCandidates) ? routeResult.confirmationCandidates : []
  ).filter(item => selectedSet.has(item?.modeKey))
  return {
    ...(aggregateResult && typeof aggregateResult === 'object' ? aggregateResult : {}),
    diagnosis_mode_route_result: {
      ...routeResult,
      nextAction: selectedDirectMatches.length ? 'direct_result' : 'question_package',
      routePrimaryAction: selectedDirectMatches.length ? 'direct_result' : 'question_package',
      directMatches: selectedDirectMatches,
      confirmationCandidates: selectedConfirmationCandidates,
      associatedModes: Array.from(selectedSet),
      directionChoices: directionChoicesFromRoute(routeResult)
    }
  }
}

async function buildStaticModeDirectionResult({
  selectedModeKey = '',
  sessionId = '',
  round = 1,
  plantContext = {},
  aggregateResult = null
} = {}) {
  const option = STATIC_MODE_OPTIONS[selectedModeKey]
  if (!option) {
    return null
  }
  const response = await getBuildStaticQuestionPackageStartRoundResult()({
    sessionId,
    option,
    plantContext,
    round
  })
  return {
    ...response,
    selectedModeKey,
    routePrimaryAction: 'direction_choice_selected',
    visualAggregateResult: aggregateResult,
    diagnosisModeRouteResult: routeFromAggregate(aggregateResult)
  }
}

// dispatch-20260726-mode-outcome-runtime-recovery: 为 resolveSpecificPestAnswerResult 返回的
// direct result 附加 selectedModeKey / selectedModeKeys，保持具体虫害身份。
// 单一虫害 mode（如 aphid）提交时 selectedModeKey 必须是具体 mode，不回退为 pest 大类；
// 多虫害仍使用 pest 聚合入口。
function attachSelectedModeIdentity(result = null, selectedModeKeys = []) {
  if (!result || typeof result !== 'object') {
    return result
  }
  const resolvedSelectedModeKey =
    selectedModeKeys.length === SINGLE_SELECTED_MODE_COUNT
      ? selectedModeKeys[0]
      : PEST_CATEGORY
  return {
    ...result,
    selectedModeKey: resolvedSelectedModeKey,
    selectedModeKeys
  }
}

function buildPestModeDirectionResult({
  selectedModeKeys = [],
  sessionId = '',
  round = 1,
  plantContext = {},
  aggregateResult = null,
  completedResultRefinement = false
} = {}) {
  const selectedAggregate = buildSelectedModeAggregate(aggregateResult, selectedModeKeys)
  const selectedRoute = routeFromAggregate(selectedAggregate) || {}
  const directModeKeys = (
    Array.isArray(selectedRoute.directMatches) ? selectedRoute.directMatches : []
  )
    .map(item => item.modeKey)
    .filter(Boolean)
  let confirmationModeKeys = (
    Array.isArray(selectedRoute.confirmationCandidates) ? selectedRoute.confirmationCandidates : []
  )
    .map(item => item.modeKey)
    .filter(modeKey => modeKey && !directModeKeys.includes(modeKey))
  const hiddenPrefilledEvidence = mergeEvidenceLedgers(
    routeEvidenceLedger(selectedRoute),
    buildVisualAdmittedEvidenceLedger({
      aggregateResult: selectedAggregate,
      selectedModeKeys
    })
  )
  const hiddenDirectModes = new Set(
    hiddenPrefilledEvidence
      .filter(item => item?.routeEvidenceRole === 'direct_match')
      .map(item => item?.diagnosisMode || item?.diagnosis_mode || item?.modeKey)
      .filter(Boolean)
  )
  for (const modeKey of directModeKeys) {
    if (hiddenDirectModes.has(modeKey)) {
      continue
    }
    hiddenPrefilledEvidence.push({
      evidenceKey: modeKey,
      symptomKey: modeKey,
      diagnosisMode: modeKey,
      modeKey,
      routeEvidenceRole: 'direct_match',
      sourceType: 'visual_mode_router',
      currentStatus: 'active',
      suppressEquivalentQuestion: true,
      lockedInQuestionnaire: true
    })
  }
  // dispatch-20260726-mode-outcome-runtime-recovery: 当 route 为 direct tier（>=0.95 模型直判）
  // 但所选 pest mode 仅在 confirmationCandidates 中（无 evidence-based direct match）时，
  // 使用 directEvidenceLedgerForDirectResult 把 >=0.95 候选提升为 direct_match，
  // 与 pest-visual-orchestrator 的 direct_result 路径保持一致。
  // 这样 resolveSpecificPestAnswerResult 会输出 direct 级 confidenceLevel 和不带"可能是"的文案，
  // 而不是落入 question_package 分支产生 selectedModeKey='pest' 的空问题包。
  const effectiveRouteTier = String(selectedRoute.confidenceTier || '').trim()
  if (
    effectiveRouteTier === 'direct' &&
    !directModeKeys.length &&
    confirmationModeKeys.length > 0
  ) {
    const directTierLedger = directEvidenceLedgerForDirectResult(
      selectedRoute,
      confirmationModeKeys,
      effectiveRouteTier
    )
    // 合并 direct tier 提升的 direct_match evidence（去重）
    const mergedMap = new Map(
      hiddenPrefilledEvidence.map(item => [
        `${item?.modeKey || ''}::${item?.evidenceKey || ''}::${item?.routeEvidenceRole || ''}`,
        item
      ])
    )
    for (const item of directTierLedger) {
      if (item?.routeEvidenceRole !== 'direct_match') {
        continue
      }
      const key = `${item?.modeKey || ''}::${item?.evidenceKey || ''}::${item?.routeEvidenceRole || ''}`
      if (!mergedMap.has(key)) {
        mergedMap.set(key, item)
        hiddenPrefilledEvidence.push(item)
        hiddenDirectModes.add(item.modeKey)
      }
    }
    // 提升后 directModeKeys 应包含被提升的 >=0.95 候选
    for (const modeKey of confirmationModeKeys) {
      if (hiddenDirectModes.has(modeKey) && !directModeKeys.includes(modeKey)) {
        directModeKeys.push(modeKey)
      }
    }
    // 已提升为 direct 的 mode 不再作为 confirmation candidate
    confirmationModeKeys = confirmationModeKeys.filter(modeKey => !directModeKeys.includes(modeKey))
  }
  if (completedResultRefinement && selectedModeKeys.length <= SINGLE_SELECTED_MODE_COUNT) {
    return attachSelectedModeIdentity(
      resolveSpecificPestAnswerResult({
        sessionId,
        round,
        answers: [],
        questionPackage: {
          candidateModes: selectedModeKeys,
          hiddenPrefilledEvidence,
          packageQuestions: []
        },
        probableModes: directModeKeys.length ? [] : confirmationModeKeys,
        plantContext,
        visualAggregateResult: selectedAggregate
      }),
      selectedModeKeys
    )
  }
  if (directModeKeys.length && !confirmationModeKeys.length) {
    return attachSelectedModeIdentity(
      resolveSpecificPestAnswerResult({
        sessionId,
        round,
        answers: [],
        questionPackage: {
          candidateModes: directModeKeys,
          hiddenPrefilledEvidence,
          packageQuestions: []
        },
        plantContext,
        visualAggregateResult: selectedAggregate
      }),
      selectedModeKeys
    )
  }
  // 方向选择后构建确认问题包：仅在 route 为 question_package 模式且携带有效 tier 时
  // 传递 tier/budget，避免 fallback 路由或 direct_result 细化路径误传 budget=0。
  const routeBudget = Number(selectedRoute.questionBudget || 0)
  const shouldApplyTier =
    selectedRoute.nextAction === 'question_package' && effectiveRouteTier && routeBudget > 0
  const questionPackage = buildSpecificPestQuestionPackage({
    candidateModes: confirmationModeKeys,
    hiddenPrefilledEvidence,
    ...(shouldApplyTier
      ? { confidenceTier: effectiveRouteTier, maxQuestions: routeBudget }
      : {})
  })
  const directOutcome = directModeKeys.length
    ? attachSelectedModeIdentity(
        resolveSpecificPestAnswerResult({
          sessionId,
          round,
          answers: [],
          questionPackage: {
            candidateModes: directModeKeys,
            hiddenPrefilledEvidence,
            packageQuestions: []
          },
          plantContext,
          visualAggregateResult: selectedAggregate
        }),
        selectedModeKeys
      )
    : null
  if (directOutcome && (!questionPackage || questionPackage.questionCount === 0)) {
    return directOutcome
  }
  // dispatch-20260726-mode-outcome-runtime-recovery: 单一具体虫害 mode 提交时，
  // selectedModeKey 必须保持具体虫害身份（如 aphid），不回退为通用 pest 大类。
  // 多虫害（selectedModeKeys.length > 1）仍使用 pest 聚合入口。
  const resolvedSelectedModeKey =
    selectedModeKeys.length === SINGLE_SELECTED_MODE_COUNT
      ? selectedModeKeys[0]
      : PEST_CATEGORY
  return {
    diagnosisSessionId: sessionId,
    roundId: `round_${round}`,
    plantContext,
    selectedModeKey: resolvedSelectedModeKey,
    selectedModeKeys,
    routePrimaryAction: 'question_package',
    sessionStatus: 'awaiting_follow_up',
    questionRequired: true,
    questions: questionPackage.packageQuestions,
    questionPackage,
    visualAggregateResult: selectedAggregate,
    visibleOutcomes: directOutcome?.visibleOutcomes || [],
    observedEvidenceSet: buildSpecificPestObservedEvidenceSet({
      candidateModes: selectedModeKeys.filter(modeKey =>
        Object.prototype.hasOwnProperty.call(PEST_MODE_LABELS, modeKey)
      )
    })
  }
}

async function buildAiModeDirectionResult({
  selectedModeKey = '',
  openid = '',
  sessionId = '',
  round = 1,
  refreshedSessionState = {},
  aggregateResult = null
} = {}) {
  const selectedAggregate = buildSelectedModeAggregate(aggregateResult, [selectedModeKey])
  return getDiagnosisEngine().runDiagnosisRound({
    openid,
    userPlantId: refreshedSessionState.userPlantId,
    plantId: refreshedSessionState.plantId,
    lockedPlantContext: refreshedSessionState.plantContext,
    observedSymptoms: [],
    observedEvidenceSet: refreshedSessionState.observedEvidenceSet || [],
    visualAggregateResult: selectedAggregate,
    answers: [],
    askedQuestionKeys: [],
    answeredQuestionGroupKeys: [],
    unknownCountByGroup: {},
    round,
    stage: 'question',
    sessionId
  })
}

async function resolveDirectionChoiceRoundResult({
  payload = {},
  openid = '',
  sessionId = '',
  round = 1,
  refreshedSessionState = {},
  sessionState = {}
} = {}) {
  const selectedModeKey = selectedDirectionKey(payload)
  const aggregateResult = resolveAggregateForDirectionChoice(refreshedSessionState, sessionState)
  let effectiveAggregateResult = aggregateResult
  let routeResult = routeFromAggregate(aggregateResult)
  const fallbackChoices = directionChoicesFromState(refreshedSessionState, sessionState)
  const fallbackChoice = findDirectionChoiceInList(fallbackChoices, selectedModeKey)
  if (
    selectedModeKey === PEST_CATEGORY &&
    fallbackChoice &&
    (!routeResult || !['choose_direction', 'direct_result'].includes(routeResult.nextAction))
  ) {
    routeResult = buildPestFallbackRouteResultFromChoice(fallbackChoice)
    effectiveAggregateResult = {
      ...(aggregateResult && typeof aggregateResult === 'object' ? aggregateResult : {}),
      diagnosis_mode_route_result: routeResult
    }
  }
  const canRefineCompletedPest =
    routeResult?.nextAction === 'direct_result' && selectedModeKey === PEST_CATEGORY
  if (!routeResult || (routeResult.nextAction !== 'choose_direction' && !canRefineCompletedPest)) {
    throw Object.assign(new Error('当前会话不需要选择诊断方向'), { statusCode: 400 })
  }
  assertAllowedDirectionChoice(routeResult, selectedModeKey, fallbackChoices)
  const selectedChoice =
    findDirectionChoice(routeResult, selectedModeKey) || fallbackChoice || payload?.directionChoice
  const plantContext = refreshedSessionState.plantContext || sessionState.plantContext || {}
  if (selectedModeKey === PEST_CATEGORY) {
    return buildPestModeDirectionResult({
      selectedModeKeys: selectedPestModeKeysFromChoice(selectedChoice, routeResult),
      sessionId,
      round,
      plantContext,
      aggregateResult: effectiveAggregateResult,
      completedResultRefinement: canRefineCompletedPest
    })
  }
  // dispatch-20260726-mode-outcome-runtime-recovery: 单一具体虫害 mode（如 aphid）
  // 作为 directionChoice 提交时，必须路由至 buildPestModeDirectionResult，不能落入
  // static/AI 分支或抛 501。pest 模式（spider_mite/aphid/...）都是已注册虫害模式，
  // requiresAiInitialAssessment=true 会让其误入 AI 分支；此处优先识别 pest mode 并
  // 走虫害问诊/outcome 构建器，保留具体虫害身份。
  if (PEST_MODE_KEYS.includes(selectedModeKey)) {
    return buildPestModeDirectionResult({
      selectedModeKeys: [selectedModeKey],
      sessionId,
      round,
      plantContext,
      aggregateResult: effectiveAggregateResult,
      completedResultRefinement: false
    })
  }
  const staticResult = await buildStaticModeDirectionResult({
    selectedModeKey,
    sessionId,
    round,
    plantContext,
    aggregateResult: effectiveAggregateResult
  })
  if (staticResult) {
    return staticResult
  }
  if (DIAGNOSIS_MODE_REGISTRY[selectedModeKey]?.requiresAiInitialAssessment) {
    return buildAiModeDirectionResult({
      selectedModeKey,
      openid,
      sessionId,
      round,
      refreshedSessionState,
      aggregateResult: effectiveAggregateResult
    })
  }
  throw Object.assign(new Error('所选诊断方向暂不支持继续处理'), { statusCode: 501 })
}

module.exports = {
  isDirectionChoicePayload,
  normalizeDirectionChoiceMode,
  resolveDirectionChoiceRoundResult,
  _test: {
    buildSelectedModeAggregate,
    directionChoicesFromRoute
  }
}
