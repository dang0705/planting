function parseNestedNode(value) {
  if (typeof value !== 'string') {
    return value
  }
  const normalized = value.trim()
  if (!normalized) {
    return value
  }
  try {
    return JSON.parse(normalized)
  } catch {
    return value
  }
}

const NESTED_KEYS = ['data', 'payload', 'node', 'item']

function walkNestedNodes(source, visitor, maxDepth = 3) {
  const queue = [{ value: source, depth: 0 }]
  const visited = new Set()

  while (queue.length) {
    const current = queue.shift()
    const value = parseNestedNode(current.value)
    if (!value || typeof value !== 'object' || visited.has(value)) {
      continue
    }
    visited.add(value)

    const result = visitor(value, current.depth)
    if (result !== undefined) {
      return result
    }
    if (current.depth >= maxDepth) {
      continue
    }
    NESTED_KEYS.forEach(key => {
      if (value[key] !== undefined && value[key] !== null) {
        queue.push({ value: value[key], depth: current.depth + 1 })
      }
    })
  }

  return undefined
}

function findVisualDisplayText(payloadItem = {}) {
  return (
    walkNestedNodes(payloadItem, value => {
      const displayText = [
        value.displayText,
        value.display_text,
        value.progressText,
        value.progress_text,
        value.statusText,
        value.status_text
      ]
        .map(item => String(item || '').trim())
        .find(Boolean)
      return displayText || undefined
    }) || ''
  )
}

export function findStreamEventName(eventName, payloadItem = {}) {
  const candidates = [String(eventName || '').trim()]
  walkNestedNodes(payloadItem, value => {
    ;[value.event, value.type, value.phase].forEach(item => {
      const normalized = String(item || '').trim()
      if (normalized) {
        candidates.push(normalized)
      }
    })
    return undefined
  })

  return (
    candidates.find(value => value.startsWith('visual_')) ||
    candidates.find(value => ['reply', 'error', 'done'].includes(value)) ||
    candidates.find(Boolean) ||
    'message'
  )
}

export function findStreamEventPayload(eventName, payloadItem = {}) {
  const targetEventName = String(eventName || '').trim()
  return (
    walkNestedNodes(payloadItem, value => {
      const nestedEventName = [value.event, value.type, value.phase]
        .map(item => String(item || '').trim())
        .find(Boolean)
      return nestedEventName === targetEventName ? value : undefined
    }) || payloadItem
  )
}

function normalizeVisualDecisionEvent(payloadItem = {}) {
  const decision = payloadItem?.decision || {}
  const counts = decision?.counts || {}
  const symptomCandidates = Array.isArray(decision?.symptomCandidates)
    ? decision.symptomCandidates
    : Array.isArray(decision?.aggregatedSymptomCandidates)
      ? decision.aggregatedSymptomCandidates
      : Array.isArray(decision?.aggregated_symptom_candidates)
        ? decision.aggregated_symptom_candidates
        : Array.isArray(payloadItem?.aggregated_symptom_candidates)
          ? payloadItem.aggregated_symptom_candidates
          : Array.isArray(payloadItem?.symptom_candidates)
            ? payloadItem.symptom_candidates
            : []
  const outOfPoolSymptomCandidates = Array.isArray(decision?.outOfPoolSymptomCandidates)
    ? decision.outOfPoolSymptomCandidates
    : Array.isArray(decision?.out_of_pool_symptom_candidates)
      ? decision.out_of_pool_symptom_candidates
      : Array.isArray(decision?.outOfPoolSymptomHints)
        ? decision.outOfPoolSymptomHints
        : Array.isArray(decision?.out_of_pool_symptom_hints)
          ? decision.out_of_pool_symptom_hints
          : Array.isArray(payloadItem?.out_of_pool_symptom_hints)
            ? payloadItem.out_of_pool_symptom_hints
            : Array.isArray(payloadItem?.out_of_pool_symptom_candidates)
              ? payloadItem.out_of_pool_symptom_candidates
              : []
  const observedSymptoms = Array.isArray(decision?.observedSymptoms)
    ? decision.observedSymptoms
    : Array.isArray(decision?.observed_symptoms)
      ? decision.observed_symptoms
      : Array.isArray(payloadItem?.observed_symptoms)
        ? payloadItem.observed_symptoms
        : []
  const routeHints = Array.isArray(decision?.routeHints)
    ? decision.routeHints
    : Array.isArray(decision?.aggregateRouteHints)
      ? decision.aggregateRouteHints
      : Array.isArray(decision?.aggregate_route_hints)
        ? decision.aggregate_route_hints
        : []
  return {
    counts: {
      observedSymptoms: Number(counts.observedSymptoms || observedSymptoms.length || 0),
      symptomCandidates: Number(counts.symptomCandidates || symptomCandidates.length || 0),
      outOfPoolSymptomCandidates: Number(
        counts.outOfPoolSymptomCandidates || outOfPoolSymptomCandidates.length || 0
      ),
      routeHints: Number(counts.routeHints || routeHints.length || 0)
    }
  }
}

export function buildVisualProgressText(eventName, payloadItem = {}) {
  const normalizedEventName = String(
    eventName || payloadItem?.phase || payloadItem?.type || ''
  ).trim()
  const nodeText = findVisualDisplayText(payloadItem)
  if (nodeText) {
    return nodeText
  }

  if (normalizedEventName === 'visual_progress') {
    return String(payloadItem?.content || '').trim() || '正在检查照片。'
  }
  if (normalizedEventName === 'visual_session_created') {
    return '已准备好，正在检查照片。'
  }
  if (normalizedEventName === 'visual_preparing') {
    return '正在准备检查照片。'
  }
  if (normalizedEventName === 'visual_input_ready') {
    const imageCount = Number(payloadItem?.imageCount || 0)
    return imageCount > 1
      ? `已收到 ${imageCount} 张照片，正在逐张查看。`
      : '已收到照片，正在仔细查看。'
  }
  if (normalizedEventName === 'visual_model_started') {
    return '正在查看照片中的可见痕迹。'
  }
  if (normalizedEventName === 'visual_model_response_started') {
    return '正在整理检查结果。'
  }
  if (normalizedEventName === 'visual_model_complete') {
    return '照片已查看，正在整理结果。'
  }
  if (normalizedEventName === 'visual_decision_ready') {
    const decision = normalizeVisualDecisionEvent(payloadItem)
    const inPoolCount = Math.max(
      decision.counts.symptomCandidates,
      decision.counts.observedSymptoms
    )
    const visibleAbnormalityCount =
      inPoolCount + decision.counts.outOfPoolSymptomCandidates
    return visibleAbnormalityCount > 0
      ? `照片检查完成，发现 ${visibleAbnormalityCount} 处需要留意的地方。`
      : '照片检查完成，暂时没有发现明显异常；如仍有疑问，可补拍更清楚的照片。'
  }
  if (normalizedEventName === 'visual_persisted') {
    return '照片已检查，正在准备下一步。'
  }
  if (normalizedEventName === 'visual_extraction_complete') {
    return '照片检查完成，正在准备问题或结果。'
  }
  return ''
}

export { parseNestedNode }
