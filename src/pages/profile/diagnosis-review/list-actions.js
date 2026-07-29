import {
  requestDiagnosisReviewImages,
  requestDiagnosisReviewList
} from '@/http-functions/diagnose/diagnosis-review.js'
import { createListState } from './state.js'

export function useDiagnosisReviewListActions(ctx) {
  const {
    manualListState,
    batchListState,
    sessionListState,
    items,
    imageLoadingMap,
    imagePreviewMap,
    imageIntersectionAttempted,
    imageErrorRetryAttempted,
    detailDrawerVisible,
    selectedSessionId,
    filters
  } = ctx
  const scheduleAutoLoadVisiblePreviewImages = (...args) =>
    ctx.scheduleAutoLoadVisiblePreviewImages(...args)
  const schedulePreviewLazyScan = (...args) => ctx.schedulePreviewLazyScan(...args)
  const showMessage = (...args) => ctx.showMessage(...args)

  function stateForSource(sourceType = '') {
    if (sourceType === 'batch') {
      return batchListState.value
    }
    if (sourceType === 'session') {
      return sessionListState.value
    }
    return manualListState.value
  }

  function sortItemsByCreatedAt(rows = []) {
    return [...(Array.isArray(rows) ? rows : [])].sort((left, right) => {
      const leftTime = new Date(left?.createdAt || 0).getTime()
      const rightTime = new Date(right?.createdAt || 0).getTime()
      return rightTime - leftTime
    })
  }

  function syncCombinedItems() {
    items.value = sortItemsByCreatedAt([
      ...manualListState.value.items,
      ...batchListState.value.items,
      ...sessionListState.value.items
    ])
  }

  function resolveRowIndex(sourceType = 'manual', index = 0) {
    const currentState = stateForSource(sourceType)
    const currentPage = Math.max(1, Number(currentState.page || 1))
    const currentPageSize = Math.max(1, Number(currentState.pageSize || 20))
    return (currentPage - 1) * currentPageSize + Number(index || 0) + 1
  }

  function sectionTotalPages(sourceType = 'manual') {
    const currentState = stateForSource(sourceType)
    if (!currentState.total) {
      return 1
    }
    return Math.max(1, Math.ceil(currentState.total / currentState.pageSize))
  }

  function resolveRowPreviewImage(row = null) {
    const sessionId = String(row?.diagnosisSessionId || '').trim()
    const mapPreview = sessionId ? imagePreviewMap.value?.[sessionId]?.[0] : ''
    return String(mapPreview || '').trim()
  }

  function updateListState(sourceType, data = {}) {
    const currentState = stateForSource(sourceType)
    currentState.items = Array.isArray(data?.items) ? data.items : []
    currentState.fallbackMode = String(data?.fallbackMode || 'formal_review')
    currentState.total = Number(data?.total || 0)
    currentState.hasMore = Boolean(data?.hasMore)
    currentState.summary = {
      total: Number(data?.summary?.total || 0),
      finalizedCount: Number(data?.summary?.finalizedCount || 0),
      pendingCount: Number(data?.summary?.pendingCount || 0),
      problematicCount: Number(data?.summary?.problematicCount || 0),
      nonProblematicCount: Number(data?.summary?.nonProblematicCount || 0),
      uncertainCount: Number(data?.summary?.uncertainCount || 0),
      otherOutcomeCount: Number(data?.summary?.otherOutcomeCount || 0),
      manualCount: Number(data?.summary?.manualCount || 0),
      batchCount: Number(data?.summary?.batchCount || 0),
      sessionCount: Number(data?.summary?.sessionCount || 0)
    }
    scheduleAutoLoadVisiblePreviewImages(sourceType)
    schedulePreviewLazyScan()
  }

  function resetListState(sourceType) {
    const initial = createListState()
    const currentState = stateForSource(sourceType)
    currentState.loading = initial.loading
    currentState.items = initial.items
    currentState.total = initial.total
    currentState.hasMore = initial.hasMore
    currentState.summary = initial.summary
    currentState.fallbackMode = initial.fallbackMode
  }

  async function loadSourceList(sourceType = 'manual') {
    const currentState = stateForSource(sourceType)
    currentState.loading = true
    try {
      const data = await requestDiagnosisReviewList({
        page: currentState.page,
        pageSize: currentState.pageSize,
        outcomeType: filters.value.outcomeType,
        sourceType,
        keyword: filters.value.keyword
      })
      updateListState(sourceType, data)
      syncCombinedItems()
      if (import.meta.env.DEV) {
        console.info('[diagnosis-review] list state updated', {
          sourceType,
          itemCount: currentState.items.length,
          total: currentState.total,
          fallbackMode: currentState.fallbackMode
        })
      }
      if (
        selectedSessionId.value &&
        !items.value.some(item => item.diagnosisSessionId === selectedSessionId.value)
      ) {
        detailDrawerVisible.value = false
        selectedSessionId.value = ''
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('[diagnosis-review] list state update failed', {
          sourceType,
          message: error?.message || String(error)
        })
      }
      currentState.items = []
      currentState.total = 0
      currentState.hasMore = false
      currentState.summary = createListState().summary
      showMessage(
        `${
          sourceType === 'batch' ? '批跑' : sourceType === 'session' ? '未归一历史' : '手动'
        }记录读取失败：${error?.message || '未知错误'}`,
        'error'
      )
    } finally {
      currentState.loading = false
    }
  }

  async function loadList() {
    imageIntersectionAttempted.clear()
    const tasks = []
    if (filters.value.sourceType !== 'batch') {
      tasks.push(loadSourceList('manual'))
    } else {
      resetListState('manual')
    }
    if (filters.value.sourceType !== 'manual') {
      tasks.push(loadSourceList('batch'))
    } else {
      resetListState('batch')
    }
    if (filters.value.sourceType === 'session') {
      tasks.push(loadSourceList('session'))
    } else {
      resetListState('session')
    }
    await Promise.all(tasks)
    syncCombinedItems()
  }

  function applyFilters() {
    manualListState.value.page = 1
    batchListState.value.page = 1
    sessionListState.value.page = 1
    loadList()
  }

  function resetFilters() {
    filters.value = {
      outcomeType: 'all',
      sourceType: 'all',
      keyword: ''
    }
    manualListState.value.page = 1
    batchListState.value.page = 1
    sessionListState.value.page = 1
    loadList()
  }

  function handlePageChange(sourceType, nextPage) {
    const currentState = stateForSource(sourceType)
    currentState.page = Number(nextPage || 1)
    loadSourceList(sourceType)
  }

  function updateItemPreviewImage(diagnosisSessionId, previewImageRef = '') {
    if (!previewImageRef) {
      return
    }
    const patch = current =>
      current.diagnosisSessionId === diagnosisSessionId
        ? {
            ...current,
            previewImageRef
          }
        : current
    manualListState.value.items = manualListState.value.items.map(patch)
    batchListState.value.items = batchListState.value.items.map(patch)
    sessionListState.value.items = sessionListState.value.items.map(patch)
    syncCombinedItems()
  }

  function clearItemPreviewImage(diagnosisSessionId = '') {
    const safeSessionId = String(diagnosisSessionId || '').trim()
    if (!safeSessionId) {
      return
    }
    const patch = current =>
      current.diagnosisSessionId === safeSessionId
        ? {
            ...current,
            previewImageRef: ''
          }
        : current
    manualListState.value.items = manualListState.value.items.map(patch)
    batchListState.value.items = batchListState.value.items.map(patch)
    sessionListState.value.items = sessionListState.value.items.map(patch)
    const nextPreviewMap = { ...imagePreviewMap.value }
    delete nextPreviewMap[safeSessionId]
    imagePreviewMap.value = nextPreviewMap
    syncCombinedItems()
  }

  async function ensurePreviewImages(item, { silent = false, forceRefresh = false } = {}) {
    const sessionId = item?.diagnosisSessionId
    if (!sessionId) {
      return []
    }

    if (
      !forceRefresh &&
      Array.isArray(imagePreviewMap.value[sessionId]) &&
      imagePreviewMap.value[sessionId].length
    ) {
      return imagePreviewMap.value[sessionId]
    }

    if (imageLoadingMap.value[sessionId]) {
      return []
    }

    imageLoadingMap.value = {
      ...imageLoadingMap.value,
      [sessionId]: true
    }

    try {
      const data = await requestDiagnosisReviewImages({
        diagnosisSessionId: sessionId,
        sourceType: item?.reviewSourceType || 'all',
        sampleAbsolutePath: item?.batchReviewMeta?.sampleAbsolutePath || ''
      })
      const previewImageRefs = Array.isArray(data?.previewImageRefs) ? data.previewImageRefs : []
      const coverImageRef = String(data?.coverImageRef || previewImageRefs[0] || '').trim()
      if (coverImageRef) {
        updateItemPreviewImage(sessionId, coverImageRef)
      }
      imagePreviewMap.value = {
        ...imagePreviewMap.value,
        [sessionId]: previewImageRefs
      }
      return previewImageRefs
    } catch (error) {
      if (!silent) {
        showMessage(error?.message || '读取诊断图片失败', 'error')
      }
      return []
    } finally {
      const nextLoadingMap = { ...imageLoadingMap.value }
      delete nextLoadingMap[sessionId]
      imageLoadingMap.value = nextLoadingMap
    }
  }

  function handleImageError(item) {
    const sessionId = String(item?.diagnosisSessionId || '').trim()
    if (!sessionId || imageErrorRetryAttempted.has(sessionId)) {
      return
    }
    imageErrorRetryAttempted.add(sessionId)
    clearItemPreviewImage(sessionId)
    ensurePreviewImages(item, { silent: true, forceRefresh: true })
  }

  async function handleImageAction(item) {
    const previewImageRefs = await ensurePreviewImages(item, { forceRefresh: true })
    if (!previewImageRefs.length) {
      showMessage('当前记录没有可回放图片', 'warning')
    }
  }

  return {
    stateForSource,
    sortItemsByCreatedAt,
    syncCombinedItems,
    resolveRowIndex,
    sectionTotalPages,
    resolveRowPreviewImage,
    updateListState,
    resetListState,
    loadSourceList,
    loadList,
    applyFilters,
    resetFilters,
    handlePageChange,
    updateItemPreviewImage,
    clearItemPreviewImage,
    ensurePreviewImages,
    handleImageError,
    handleImageAction
  }
}
