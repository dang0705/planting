/* oxlint-disable no-unused-vars */
import { computed } from 'vue'

export function useDiagnosisReviewComputed(ctx) {
  const {
    manualListState,
    batchListState,
    sessionListState,
    items,
    imagePreviewMap,
    selectedSessionId,
    compareSessionIds,
    filters,
    detailMap,
    formatOutcomeLabel,
    formatRouteText,
    formatSourceLabel,
    formatDecisionGovernance,
    formatDetailPromptStats,
    formatOutOfPoolCandidates,
    formatVisualRouteHints,
    formatQuestionCountSummary,
    formatSymptomClassSummary,
    formatRawSymptoms,
    formatDetailLines,
    getObservedEvidenceLabels,
    getDiagnosisDirectionLabels,
    getVisualCandidateLabels,
    getRouteDecision,
    resolveFirstParsedVisualResult
  } = ctx
  const normalizeCompareSessionIds = (...args) => ctx.normalizeCompareSessionIds(...args)

  const activeSectionStates = computed(() => reviewSections.value.map(section => section.state))

  const summary = computed(() =>
    activeSectionStates.value.reduce(
      (accumulator, currentState) => ({
        total: accumulator.total + Number(currentState.summary.total || 0),
        manualCount: accumulator.manualCount + Number(currentState.summary.manualCount || 0),
        batchCount: accumulator.batchCount + Number(currentState.summary.batchCount || 0),
        sessionCount: accumulator.sessionCount + Number(currentState.summary.sessionCount || 0),
        finalizedCount:
          accumulator.finalizedCount + Number(currentState.summary.finalizedCount || 0),
        pendingCount: accumulator.pendingCount + Number(currentState.summary.pendingCount || 0),
        problematicCount:
          accumulator.problematicCount + Number(currentState.summary.problematicCount || 0),
        nonProblematicCount:
          accumulator.nonProblematicCount + Number(currentState.summary.nonProblematicCount || 0),
        uncertainCount:
          accumulator.uncertainCount + Number(currentState.summary.uncertainCount || 0),
        otherOutcomeCount:
          accumulator.otherOutcomeCount + Number(currentState.summary.otherOutcomeCount || 0)
      }),
      {
        total: 0,
        manualCount: 0,
        batchCount: 0,
        sessionCount: 0,
        finalizedCount: 0,
        pendingCount: 0,
        problematicCount: 0,
        nonProblematicCount: 0,
        uncertainCount: 0,
        otherOutcomeCount: 0
      }
    )
  )

  const tableHeight = computed(() => 'calc(100vh - 350px)')

  const reviewSections = computed(() => {
    const sections = []
    if (filters.value.sourceType !== 'batch') {
      sections.push({
        key: 'manual',
        title: '真人手动诊断记录',
        state: manualListState.value
      })
    }
    if (filters.value.sourceType !== 'manual') {
      sections.push({
        key: 'batch',
        title: '脚本批跑诊断记录',
        state: batchListState.value
      })
    }
    if (filters.value.sourceType === 'session') {
      sections.push({
        key: 'session',
        title: '未归一历史记录',
        state: sessionListState.value
      })
    }
    return sections
  })

  const currentRow = computed(() => {
    const sessionId = selectedSessionId.value
    return items.value.find(item => item.diagnosisSessionId === sessionId) || null
  })

  const currentDetail = computed(() => {
    const sessionId = selectedSessionId.value
    return detailMap.value[sessionId] || null
  })

  const compareSessionOptions = computed(() =>
    items.value
      .filter(item => {
        const sessionId = String(item?.diagnosisSessionId || '').trim()
        return sessionId && sessionId !== selectedSessionId.value
      })
      .map(item => ({
        label: `${item.diagnosisSessionId} | ${item.displayName || '诊断记录'} | ${formatOutcomeLabel(item.outcomeType)}`,
        value: item.diagnosisSessionId
      }))
  )

  const compareColumns = computed(() => {
    const currentSessionId = String(selectedSessionId.value || '').trim()
    const comparisonIds = normalizeCompareSessionIds(compareSessionIds.value)
    const sessionIds = [currentSessionId, ...comparisonIds].filter(Boolean)

    return sessionIds.map((sessionId, index) => ({
      sessionId,
      roleLabel: index === 0 ? '当前' : `对比${index}`,
      detail: detailMap.value[sessionId] || null,
      row: items.value.find(item => item.diagnosisSessionId === sessionId) || null
    }))
  })

  const compareSessionNotice = computed(() => {
    if (!selectedSessionId.value) {
      return ''
    }
    if (!compareSessionIds.value.length) {
      return '尚未选择对比 session；可从当前列表选择，也可粘贴任意 sessionId 添加。'
    }
    return `正在对比 ${compareSessionIds.value.length} 个 session。`
  })

  const compareRows = computed(() => [
    {
      key: 'result.outcome',
      label: '结果类型',
      resolve: detail => formatOutcomeLabel(detail?.outcomeType || '')
    },
    {
      key: 'result.final',
      label: '最终结论',
      resolve: detail =>
        String(detail?.displayName || detail?.finalResult?.displayName || '无').trim()
    },
    {
      key: 'result.summary',
      label: '摘要',
      resolve: detail => String(detail?.summary || detail?.finalResult?.summary || '无').trim()
    },
    {
      key: 'decision.route_stop',
      label: '决策 / 停止',
      resolve: detail =>
        [
          detail?.routePrimaryAction ||
            detail?.coreProcess?.questions?.routePrimaryAction ||
            '未返回',
          detail?.stopReason || detail?.coreProcess?.decision?.stopReason || '未返回',
          getRouteDecision(detail)?.decisionCause?.decisionCauseKey || ''
        ]
          .filter(Boolean)
          .join(' / ')
    },
    {
      key: 'visual.prompt_token',
      label: 'Prompt / Token',
      resolve: detail => formatDetailPromptStats(detail)
    },
    {
      key: 'visual.raw_candidates',
      label: '模型正式候选',
      resolve: detail =>
        formatRawSymptoms(resolveFirstParsedVisualResult(detail)?.symptom_candidates)
    },
    {
      key: 'visual.out_of_pool',
      label: '池外候选',
      resolve: detail => formatOutOfPoolCandidates(detail)
    },
    {
      key: 'visual.aggregate',
      label: '聚合视觉候选',
      resolve: detail => formatDetailLines(getVisualCandidateLabels(detail), '无')
    },
    {
      key: 'visual.route_hints',
      label: '视觉链路提示',
      resolve: detail => formatVisualRouteHints(detail)
    },
    {
      key: 'evidence.observed',
      label: '正式证据',
      resolve: detail => formatDetailLines(getObservedEvidenceLabels(detail), '无')
    },
    {
      key: 'evidence.directions',
      label: '诊断方向',
      resolve: detail => formatDetailLines(getDiagnosisDirectionLabels(detail), '无')
    },
    {
      key: 'symptom_class',
      label: '症状模式',
      resolve: detail => formatSymptomClassSummary(detail?.symptomClass)
    },
    {
      key: 'follow_up.questions',
      label: '题目计数',
      resolve: detail => formatQuestionCountSummary(detail)
    },
    {
      key: 'decision.governance',
      label: '输出资格',
      resolve: detail => formatDecisionGovernance(detail)
    },
    {
      key: 'source',
      label: '来源',
      resolve: detail => formatSourceLabel(detail?.reviewSourceType || '')
    }
  ])

  const currentPreviewImages = computed(() => {
    const sessionId = selectedSessionId.value
    const previewImages = Array.isArray(imagePreviewMap.value[sessionId])
      ? imagePreviewMap.value[sessionId]
      : []
    if (previewImages.length) {
      return previewImages
    }
    const row = currentRow.value
    return row?.previewImageRef ? [row.previewImageRef] : []
  })

  const fallbackNotice = computed(() => {
    const activeModes = reviewSections.value
      .map(section => ({
        key: section.key,
        mode: String(section.state.fallbackMode || 'formal_review')
      }))
      .filter(item => item.mode !== 'formal_review')

    if (!activeModes.length) {
      return null
    }

    const modes = new Set(activeModes.map(item => item.mode))

    if (modes.has('local_audit_cache')) {
      return {
        title: 'DEV LOCAL CACHE',
        message:
          '当前页面正在使用本地诊断审计缓存，只用于 H5 开发态联调。正式环境仍以 `/diagnosis/review/*` 返回为准。'
      }
    }

    if (modes.has('session_history')) {
      return {
        title: 'SESSION HISTORY FALLBACK',
        message:
          '当前列表已临时回退到既有 history 链路。该模式仅用于开发态保守，返回字段会比正式审计链更少。'
      }
    }

    if (modes.has('session_result')) {
      return {
        title: 'SESSION RESULT FALLBACK',
        message:
          '当前详情已临时回退到既有 result 链路。该模式仅用于开发态保守，正式管理页仍以 review 合同为准。'
      }
    }

    return {
      title: 'FALLBACK MODE',
      message: `当前运行在适配模式：${activeModes.map(item => `${item.key}:${item.mode}`).join(' / ')}`
    }
  })

  return {
    activeSectionStates,
    summary,
    tableHeight,
    reviewSections,
    currentRow,
    currentDetail,
    compareSessionOptions,
    compareColumns,
    compareSessionNotice,
    compareRows,
    currentPreviewImages,
    fallbackNotice
  }
}
