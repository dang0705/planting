/* oxlint-disable no-unused-vars */
import { formatDecisionGovernance } from './labels.js'
import { formatDetailLines } from './basic-format.js'

export function getRouteDecision(detail = null) {
  const routeDecision = detail?.coreProcess?.route?.routeDecision || detail?.routeDecision || null
  return routeDecision && typeof routeDecision === 'object' ? routeDecision : null
}

export function getRouteDecisionFieldRows(detail = null) {
  const routeDecision = getRouteDecision(detail)
  if (!routeDecision) {
    return []
  }
  return [
    {
      key: 'mode',
      label: '模式',
      value: routeDecision.mode || '未返回'
    },
    {
      key: 'activeRouteGroupKeys',
      label: '命中流程组',
      value: formatDetailLines(routeDecision.activeRouteGroupKeys, '无')
    },
    {
      key: 'visibleOutcomeKeys',
      label: '可展示结论',
      value: formatDetailLines(routeDecision.visibleOutcomeKeys, '无')
    },
    {
      key: 'decisionCause',
      label: '决策原因',
      value:
        [
          routeDecision.decisionCause?.decisionCauseKey,
          routeDecision.decisionCause?.decisionCauseText
        ]
          .filter(Boolean)
          .join(' / ') || '无'
    }
  ]
}

export function getRoutePathRows(detail = null) {
  const routeDecision = getRouteDecision(detail)
  if (!routeDecision) {
    return []
  }
  const candidateRows = (
    Array.isArray(routeDecision.candidateOutcomeStates) ? routeDecision.candidateOutcomeStates : []
  ).map(item => ({
    key: item.outcomeKey ? `候选:${item.outcomeKey}` : '候选:未知',
    title: item.outcomeKey || '未知结果',
    meta: [
      item.state ? `状态=${item.state}` : '',
      item.missingConditionKeys?.length ? `缺少门禁=${item.missingConditionKeys.join(', ')}` : ''
    ]
      .filter(Boolean)
      .join(' / '),
    value: formatDetailLines(item.routeKeys, '无')
  }))
  const traceRows = (Array.isArray(routeDecision.routeTrace) ? routeDecision.routeTrace : []).map(
    item => ({
      key: item.outcomeKey ? `流程回看:${item.outcomeKey}` : '流程回看:未知结果',
      title: `流程回看 ${item.outcomeKey || '未知结果'}`,
      meta: formatDetailLines(item.routeKeys, '无'),
      value: formatDetailLines(
        (Array.isArray(item.conditionResults) ? item.conditionResults : []).map(result =>
          [result.conditionKey || '未知门禁', result.conditionRole || '', result.result || '']
            .filter(Boolean)
            .join(':')
        ),
        '无门禁'
      )
    })
  )
  const gateRows = (
    Array.isArray(routeDecision.conditionResults) ? routeDecision.conditionResults : []
  ).map(item => ({
    key:
      item.routeKey && item.conditionKey
        ? `${item.routeKey} / 门禁:${item.conditionKey}`
        : '门禁:未知',
    title: item.conditionKey || '未知门禁',
    meta: [item.routeKey, item.conditionRole, item.result].filter(Boolean).join(' / '),
    value: [
      `证据满足=${Boolean(item.requiredEvidenceMatched)}`,
      `答题满足=${Boolean(item.requiredAnswerEffectsMatched)}`,
      `阻断=${Boolean(item.blockerMatched)}`
    ].join(' / ')
  }))
  return [...candidateRows, ...traceRows, ...gateRows]
}

export function formatSymptomClassSummary(symptomClass = null) {
  const safeSymptomClass = symptomClass && typeof symptomClass === 'object' ? symptomClass : null
  if (!safeSymptomClass) {
    return '未映射'
  }
  const label = String(
    safeSymptomClass.currentClassLabel ||
      safeSymptomClass.classLabel ||
      safeSymptomClass.primaryClass?.classNameCn ||
      safeSymptomClass.label ||
      ''
  ).trim()
  const key = String(
    safeSymptomClass.currentClassKey ||
      safeSymptomClass.classKey ||
      safeSymptomClass.primaryClass?.classKey ||
      ''
  ).trim()
  const scoreValue = Number(
    safeSymptomClass.currentClassConfidence ??
      safeSymptomClass.currentClassScore ??
      safeSymptomClass.classScores?.[0]?.score ??
      safeSymptomClass.score ??
      safeSymptomClass.confidence ??
      0
  )
  const score = Number.isFinite(scoreValue) ? `${scoreValue.toFixed(3)}` : ''
  const parts = [label || key]
  if (label && key) {
    parts.push(`(${key})`)
  }
  if (score) {
    parts.push(`score=${score}`)
  }
  return parts.filter(Boolean).join(' ')
}

export function formatSymptomClassGuard(symptomClass = null) {
  const safeSymptomClass = symptomClass && typeof symptomClass === 'object' ? symptomClass : null
  if (!safeSymptomClass) {
    return '无门控'
  }
  const guardMode = String(
    safeSymptomClass.guardMode || safeSymptomClass.classGuardMode || ''
  ).trim()
  if (guardMode) {
    return guardMode
  }
  const classSource = String(
    safeSymptomClass.currentClassSource || safeSymptomClass.source || ''
  ).trim()
  return classSource || '已自动'
}
