import { requestDiagnosisReviewDetail } from '@/http-functions/diagnose/diagnosis-review.js'

export function useDiagnosisReviewDetailActions(ctx) {
  const {
    manualListState,
    batchListState,
    sessionListState,
    items,
    detailMap,
    detailLoadingMap,
    selectedSessionId,
    detailDrawerVisible,
    compareSessionIds,
    compareSessionInput
  } = ctx
  const showMessage = (...args) => ctx.showMessage(...args)
  const syncCombinedItems = (...args) => ctx.syncCombinedItems(...args)
  const ensurePreviewImages = (...args) => ctx.ensurePreviewImages(...args)

  async function ensureDetail(sessionId) {
    if (!sessionId) {
      return null
    }
    if (detailMap.value[sessionId]) {
      return detailMap.value[sessionId]
    }
    if (detailLoadingMap.value[sessionId]) {
      return null
    }

    detailLoadingMap.value = {
      ...detailLoadingMap.value,
      [sessionId]: true
    }

    try {
      const currentRow =
        items.value.find(current => current.diagnosisSessionId === sessionId) || null
      const detail = await requestDiagnosisReviewDetail({
        diagnosisSessionId: sessionId,
        sourceType: currentRow?.reviewSourceType || 'all'
      })
      const normalizedDetail = {
        ...detail,
        reviewSourceType: currentRow?.reviewSourceType || detail?.reviewSourceType || 'session',
        reviewSourceEvidence:
          currentRow?.reviewSourceEvidence ||
          detail?.reviewSourceEvidence ||
          'openid_inferred_session',
        clientPlatform: currentRow?.clientPlatform || detail?.clientPlatform || '',
        symptomClass: detail?.symptomClass || currentRow?.symptomClass || null,
        questionCountSummary:
          detail?.questionCountSummary || currentRow?.questionCountSummary || null,
        previewImageRef: String(
          detail?.previewImageRef || currentRow?.previewImageRef || ''
        ).trim(),
        previewVisualRawImageRecordId: String(
          detail?.previewVisualRawImageRecordId ||
            detail?.preview_visual_raw_image_record_id ||
            currentRow?.previewVisualRawImageRecordId ||
            ''
        ).trim(),
        imageCount: Number(detail?.imageCount || currentRow?.imageCount || 0)
      }
      detailMap.value = {
        ...detailMap.value,
        [sessionId]: normalizedDetail
      }
      const patch = current =>
        current.diagnosisSessionId === sessionId
          ? {
              ...current,
              ...(normalizedDetail?.displayName
                ? { displayName: normalizedDetail.displayName }
                : {}),
              ...(normalizedDetail?.summary ? { summary: normalizedDetail.summary } : {}),
              ...(normalizedDetail?.routePrimaryAction
                ? {
                    routePrimaryAction:
                      normalizedDetail.routePrimaryAction || current.routePrimaryAction
                  }
                : {}),
              ...(normalizedDetail?.stopReason
                ? { stopReason: normalizedDetail.stopReason || current.stopReason }
                : {}),
              ...(normalizedDetail?.observedEvidenceCount !== undefined
                ? { observedEvidenceCount: Number(normalizedDetail.observedEvidenceCount || 0) }
                : {}),
              ...(normalizedDetail?.derivedEvidenceCount !== undefined
                ? { derivedEvidenceCount: Number(normalizedDetail.derivedEvidenceCount || 0) }
                : {}),
              ...(normalizedDetail?.diagnosisDirectionCount !== undefined
                ? { diagnosisDirectionCount: Number(normalizedDetail.diagnosisDirectionCount || 0) }
                : {}),
              ...(Array.isArray(normalizedDetail?.diagnosisDirectionLabels)
                ? { diagnosisDirectionLabels: normalizedDetail.diagnosisDirectionLabels }
                : {}),
              ...(normalizedDetail?.symptomClass
                ? { symptomClass: normalizedDetail.symptomClass }
                : {}),
              ...(normalizedDetail?.questionCountSummary
                ? { questionCountSummary: normalizedDetail.questionCountSummary }
                : {}),
              ...(normalizedDetail?.previewImageRef !== undefined
                ? { previewImageRef: normalizedDetail.previewImageRef }
                : {}),
              ...(normalizedDetail?.imageCount !== undefined
                ? { imageCount: Number(normalizedDetail.imageCount || 0) }
                : {}),
              ...(normalizedDetail?.previewVisualRawImageRecordId
                ? { previewVisualRawImageRecordId: normalizedDetail.previewVisualRawImageRecordId }
                : {}),
              ...(normalizedDetail?.coreSummary
                ? { coreSummary: normalizedDetail.coreSummary }
                : {}),
              ...(normalizedDetail?.feedbackSummary
                ? { feedbackSummary: normalizedDetail.feedbackSummary }
                : {})
            }
          : current
      manualListState.value.items = manualListState.value.items.map(patch)
      batchListState.value.items = batchListState.value.items.map(patch)
      sessionListState.value.items = sessionListState.value.items.map(patch)
      syncCombinedItems()
      return normalizedDetail
    } catch (error) {
      showMessage(error?.message || '读取核心过程失败', 'error')
      return null
    } finally {
      const nextLoadingMap = { ...detailLoadingMap.value }
      delete nextLoadingMap[sessionId]
      detailLoadingMap.value = nextLoadingMap
    }
  }

  function normalizeCompareSessionIds(values = []) {
    const currentSessionId = String(selectedSessionId.value || '').trim()
    return Array.from(
      new Set(
        (Array.isArray(values) ? values : [])
          .flatMap(item => String(item || '').split(/[\s,，;；]+/))
          .map(item => item.trim())
          .filter(item => item && item !== currentSessionId)
      )
    ).slice(0, 2)
  }

  function handleCompareSessionSelect(values = []) {
    compareSessionIds.value = normalizeCompareSessionIds(values)
  }

  function addCompareSessionId() {
    const nextIds = normalizeCompareSessionIds([
      ...compareSessionIds.value,
      ...String(compareSessionInput.value || '').split(/[\s,，;；]+/)
    ])
    if (!nextIds.length) {
      showMessage('请输入不同于当前详情的 sessionId', 'warning')
      return
    }
    compareSessionIds.value = nextIds
    compareSessionInput.value = ''
  }

  function clearCompareSessions() {
    compareSessionIds.value = []
    compareSessionInput.value = ''
  }

  async function loadCompareSessions(sessionIds = []) {
    const targets = normalizeCompareSessionIds(sessionIds)
    if (!targets.length) {
      return
    }

    await Promise.allSettled(
      targets.map(async sessionId => {
        const row = items.value.find(item => item.diagnosisSessionId === sessionId) || {
          diagnosisSessionId: sessionId,
          reviewSourceType: 'all',
          batchReviewMeta: null
        }
        await Promise.all([ensureDetail(sessionId), ensurePreviewImages(row, { silent: true })])
      })
    )
  }

  async function openDetail(row) {
    const sessionId = String(row?.diagnosisSessionId || '').trim()
    if (!sessionId) {
      return
    }
    selectedSessionId.value = sessionId
    detailDrawerVisible.value = true
    await Promise.all([ensureDetail(sessionId), ensurePreviewImages(row, { silent: true })])
  }

  function copySessionId(item) {
    const value = String(item?.diagnosisSessionId || '').trim()
    if (!value) {
      return
    }
    uni.setClipboardData({
      data: value,
      success: () => {
        showMessage('已复制 Session ID', 'success')
      }
    })
  }

  return {
    ensureDetail,
    normalizeCompareSessionIds,
    handleCompareSessionSelect,
    addCompareSessionId,
    clearCompareSessions,
    loadCompareSessions,
    openDetail,
    copySessionId
  }
}
