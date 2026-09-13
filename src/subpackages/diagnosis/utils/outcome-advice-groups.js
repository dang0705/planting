const EMPTY_INDEX = 0
const AFTER_SEPARATOR_OFFSET = 1
const SINGLE_GROUP_COUNT = 1
const SINGLE_OUTCOME_COUNT = 1

function normalizeText(value = '') {
  if (value && typeof value === 'object') {
    return String(value.text || value.textCn || value.text_cn || '').trim()
  }
  return String(value || '').trim()
}

function normalizeStructuredActionItems(values = []) {
  const source = Array.isArray(values) ? values : []
  return source
    .filter(item => item && typeof item === 'object')
    .map(item => ({
      id: normalizeText(item.id || item.actionId || item.action_id),
      categoryId: normalizeText(item.categoryId || item.category_id),
      categoryNameCn: normalizeText(item.categoryNameCn || item.category_name_cn),
      stage: normalizeText(item.stage),
      text: normalizeText(item.text || item.textCn || item.text_cn)
    }))
    .filter(item => item.id && item.categoryId && item.text)
}

function uniqueStrings(values = []) {
  return Array.from(
    new Set((Array.isArray(values) ? values : []).map(normalizeText).filter(Boolean))
  )
}

function normalizeTextList(values = []) {
  const source = Array.isArray(values) ? values : [values]
  return source.reduce((result, value) => {
    if (Array.isArray(value)) {
      return result.concat(normalizeTextList(value))
    }
    if (value && typeof value === 'object') {
      const label = [
        value.symptomCn,
        value.symptom_cn,
        value.label,
        value.displayName,
        value.display_name_cn,
        value.displayTextCn,
        value.display_text_cn,
        value.evidenceKey,
        value.evidence_key,
        value.symptomKey,
        value.symptom_key
      ]
        .map(normalizeText)
        .find(Boolean)
      return result.concat(label || '')
    }
    return result.concat(value)
  }, [])
}

function normalizeSymptomLabel(value = '') {
  return normalizeText(value)
    .replace(/^症状\s*[:：]\s*/u, '')
    .replace(/^表现\s*[:：]\s*/u, '')
}

export function normalizeSymptomLabels(values = []) {
  return uniqueStrings(normalizeTextList(values).map(normalizeSymptomLabel))
}

export function resolveStableAdviceGroupKey(outcome = {}, outcomeKey = '') {
  const actionKey = normalizeText(
    outcome.actionAdviceKey ||
      outcome.action_advice_key ||
      outcome.actionProfileKey ||
      outcome.action_profile_key
  )
  const avoidKey = normalizeText(outcome.avoidAdviceKey || outcome.avoid_advice_key)

  if (actionKey && (!avoidKey || actionKey === avoidKey)) {
    return actionKey
  }
  if (avoidKey && !actionKey) {
    return `avoid:${avoidKey}`
  }
  if (actionKey || avoidKey) {
    return `action:${actionKey || '__none__'}|avoid:${avoidKey || '__none__'}`
  }

  return `outcome:${normalizeText(outcomeKey) || 'unknown'}`
}

function resolveOutcomeSymptomLabels(outcome = {}, outcomeLabel = '') {
  const explicitLabels = normalizeSymptomLabels([
    outcome.symptomLabels,
    outcome.symptoms,
    outcome.observedSymptoms,
    outcome.observedEvidenceSet,
    outcome.symptomCn,
    outcome.symptom_cn,
    outcome.symptomLabel,
    outcome.symptom_label,
    outcome.targetSymptomCn,
    outcome.target_symptom_cn
  ])
  if (explicitLabels.length) {
    return explicitLabels
  }

  const normalizedOutcomeLabel = normalizeText(outcomeLabel)
  const separatorIndex = normalizedOutcomeLabel.search(new RegExp('[/／]', 'u'))
  if (separatorIndex >= EMPTY_INDEX) {
    const symptomLabels = normalizeSymptomLabels(
      normalizedOutcomeLabel.slice(separatorIndex + AFTER_SEPARATOR_OFFSET).split(/[、,，；;]/u)
    )
    if (symptomLabels.length) {
      return symptomLabels
    }
  }

  return normalizedOutcomeLabel ? [normalizedOutcomeLabel] : []
}

function materializeGroups({
  groups = [],
  sourceOutcomes = [],
  sharedSymptomLabels = [],
  itemKey = 'actionItems',
  fallbackItems = [],
  fallbackLabel = '通用建议'
} = {}) {
  const normalizedFallbackItems = uniqueStrings(fallbackItems)
  const shouldUseSharedSymptoms =
    groups.length === SINGLE_GROUP_COUNT && sourceOutcomes.length > SINGLE_OUTCOME_COUNT
  const sharedLabels = shouldUseSharedSymptoms ? normalizeSymptomLabels(sharedSymptomLabels) : []
  const visibleGroups = groups
    .map(group => {
      const outcomeLabels = uniqueStrings(
        group.outcomes.map(outcome => group.getOutcomeLabel(outcome))
      )
      const symptomLabels = sharedLabels.length
        ? sharedLabels
        : uniqueStrings(
            group.outcomes.flatMap(outcome =>
              resolveOutcomeSymptomLabels(outcome, group.getOutcomeLabel(outcome))
            )
          )
      const items = uniqueStrings(group[itemKey])
      if (!outcomeLabels.length || !items.length) {
        return null
      }

      return {
        key: group.groupKey,
        adviceGroupKey: group.groupKey,
        actionProfileKey: group.actionProfileKey,
        categoryId: group.categoryId || '',
        categoryNameCn: group.categoryNameCn || '',
        outcomeLabel: outcomeLabels.join('、'),
        symptomLabel: (symptomLabels.length ? symptomLabels : outcomeLabels).join('、'),
        displayLabel:
          group.categoryNameCn || (symptomLabels.length ? symptomLabels : outcomeLabels).join('、'),
        items,
        showOutcomeLabel:
          Boolean(group.categoryNameCn) ||
          sourceOutcomes.length > SINGLE_OUTCOME_COUNT ||
          group.outcomes.length > SINGLE_OUTCOME_COUNT
      }
    })
    .filter(Boolean)

  if (visibleGroups.length || !normalizedFallbackItems.length) {
    return visibleGroups
  }

  return [
    {
      key: '__fallback__',
      adviceGroupKey: '__fallback__',
      actionProfileKey: '',
      categoryId: '',
      categoryNameCn: '',
      outcomeLabel: fallbackLabel,
      symptomLabel: '',
      displayLabel: fallbackLabel,
      items: normalizedFallbackItems,
      showOutcomeLabel: true
    }
  ]
}

export function buildSharedOutcomeAdviceGroups({
  outcomeSources = [],
  getOutcomeKey,
  getOutcomeLabel,
  getActionItems,
  getAvoidItems,
  sharedSymptomLabels = [],
  fallbackActionItems = [],
  fallbackAvoidItems = [],
  fallbackLabel = '通用建议'
} = {}) {
  const sourceOutcomes = (Array.isArray(outcomeSources) ? outcomeSources : [])
    .filter(outcome => outcome && typeof outcome === 'object')
    .map((outcome, index) => ({
      outcome,
      outcomeKey: normalizeText(getOutcomeKey?.(outcome, index) || `outcome_${index}`)
    }))

  const groupsByKey = new Map()
  for (const { outcome, outcomeKey } of sourceOutcomes) {
    const groupKey = resolveStableAdviceGroupKey(outcome, outcomeKey)
    const structuredActionItems = normalizeStructuredActionItems(outcome.actionItems).filter(
      item => item.stage !== 'avoid'
    )
    const structuredAvoidItems = normalizeStructuredActionItems(
      outcome.avoidActionItems || outcome.actionItems
    ).filter(item => item.stage === 'avoid')
    const categoryGroups = new Map()
    for (const item of [...structuredActionItems, ...structuredAvoidItems]) {
      if (!categoryGroups.has(item.categoryId)) {
        categoryGroups.set(item.categoryId, item)
      }
    }
    const groupSpecs = categoryGroups.size
      ? Array.from(categoryGroups.values()).map(item => ({
          key: `${groupKey}::category:${item.categoryId}`,
          categoryId: item.categoryId,
          categoryNameCn: item.categoryNameCn
        }))
      : [{ key: groupKey, categoryId: '', categoryNameCn: '' }]

    for (const spec of groupSpecs) {
      let group = groupsByKey.get(spec.key)
      if (!group) {
        group = {
          groupKey: spec.key,
          actionProfileKey: normalizeText(
            outcome.actionProfileKey || outcome.action_profile_key || ''
          ),
          categoryId: spec.categoryId,
          categoryNameCn: spec.categoryNameCn,
          outcomes: [],
          actionItems: [],
          avoidItems: [],
          getOutcomeLabel
        }
        groupsByKey.set(spec.key, group)
      }
      group.outcomes.push(outcome)
      const actionItems = getActionItems?.(outcome) || []
      const avoidItems = getAvoidItems?.(outcome) || []
      if (spec.categoryId) {
        const categoryActionItems = structuredActionItems
          .filter(item => item.categoryId === spec.categoryId)
          .map(item => item.text)
        const categoryAvoidItems = structuredAvoidItems
          .filter(item => item.categoryId === spec.categoryId)
          .map(item => item.text)
        group.actionItems.push(...categoryActionItems)
        group.avoidItems.push(...categoryAvoidItems)
      } else {
        group.actionItems.push(...actionItems)
        group.avoidItems.push(...avoidItems)
      }
    }
  }

  const groups = Array.from(groupsByKey.values()).map(group => ({
    ...group,
    actionItems: uniqueStrings(group.actionItems),
    avoidItems: uniqueStrings(group.avoidItems)
  }))

  return {
    actionGroups: materializeGroups({
      groups,
      sourceOutcomes: sourceOutcomes.map(item => item.outcome),
      sharedSymptomLabels,
      itemKey: 'actionItems',
      fallbackItems: fallbackActionItems,
      fallbackLabel
    }),
    avoidGroups: materializeGroups({
      groups,
      sourceOutcomes: sourceOutcomes.map(item => item.outcome),
      sharedSymptomLabels,
      itemKey: 'avoidItems',
      fallbackItems: fallbackAvoidItems,
      fallbackLabel
    })
  }
}
