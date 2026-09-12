export function useDiagnosisReviewLazyImages(ctx) {
  const {
    imageCellNodes,
    imageIntersectionObservers,
    imageIntersectionAttempted,
    imageErrorRetryAttempted,
    imagePreviewMap,
    imageLoadingMap,
    imageIntersectionRootMargin,
    imageIntersectionThreshold,
    imagePrefetchBatchSize,
    tableSectionRefs,
    isH5Runtime,
    manualListState,
    batchListState,
    sessionListState,
    items
  } = ctx
  const stateForSource = (...args) => ctx.stateForSource(...args)
  const resolveRowPreviewImage = (...args) => ctx.resolveRowPreviewImage(...args)
  const ensurePreviewImages = (...args) => ctx.ensurePreviewImages(...args)

  function normalizeSectionKey(value = '') {
    const normalized = String(value || '').trim()
    if (normalized === 'batch' || normalized === 'session') {
      return normalized
    }
    return 'manual'
  }

  function resolveReviewRowBySessionId(sessionId = '') {
    const safeSessionId = String(sessionId || '').trim()
    if (!safeSessionId) {
      return null
    }
    return (
      items.value.find(item => item.diagnosisSessionId === safeSessionId) ||
      manualListState.value.items.find(item => item.diagnosisSessionId === safeSessionId) ||
      batchListState.value.items.find(item => item.diagnosisSessionId === safeSessionId) ||
      sessionListState.value.items.find(item => item.diagnosisSessionId === safeSessionId) ||
      null
    )
  }

  function clearImageObservers() {
    for (const timer of autoLoadPreviewTimers.values()) {
      clearTimeout(timer)
    }
    autoLoadPreviewTimers.clear()
    for (const observer of imageIntersectionObservers.values()) {
      observer.disconnect()
    }
    imageIntersectionObservers.clear()
    imageCellNodes.clear()
    imageIntersectionAttempted.clear()
    imageErrorRetryAttempted.clear()
  }

  function resolveImageCellObserver(sectionKey = '') {
    const normalizedSection = normalizeSectionKey(sectionKey)
    if (!isH5Runtime || typeof IntersectionObserver === 'undefined') {
      return null
    }

    const cached = imageIntersectionObservers.get(normalizedSection)
    if (cached) {
      return cached
    }

    const root = null

    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          const node = entry.target
          if (!entry.isIntersecting) {
            continue
          }

          observer.unobserve(node)

          const sessionId = String(node?.dataset?.diagnosisSessionId || '').trim()
          if (!sessionId) {
            continue
          }

          if (imageIntersectionAttempted.has(sessionId)) {
            continue
          }
          imageIntersectionAttempted.add(sessionId)

          const row = resolveReviewRowBySessionId(sessionId)
          if (!row) {
            continue
          }

          if (
            Array.isArray(imagePreviewMap.value[sessionId]) &&
            imagePreviewMap.value[sessionId].length > 0
          ) {
            continue
          }

          if (imageLoadingMap.value[sessionId]) {
            continue
          }

          ensurePreviewImages(row, { silent: true })
        }
      },
      {
        root,
        rootMargin: imageIntersectionRootMargin,
        threshold: imageIntersectionThreshold
      }
    )

    imageIntersectionObservers.set(normalizedSection, observer)
    return observer
  }

  function registerTableSectionRef(sectionKey, node) {
    const normalizedSection = normalizeSectionKey(sectionKey)
    tableSectionRefs.value = {
      ...tableSectionRefs.value,
      [normalizedSection]: node
    }

    const existing = imageIntersectionObservers.get(normalizedSection)
    if (existing) {
      existing.disconnect()
      imageIntersectionObservers.delete(normalizedSection)
    }

    const observer = resolveImageCellObserver(normalizedSection)
    if (!observer) {
      return
    }

    for (const entry of imageCellNodes.values()) {
      if (entry.sectionKey === normalizedSection && entry.node) {
        observer.observe(entry.node)
      }
    }
  }

  function registerImageCellRef(node, sectionKey, sessionId = '') {
    const normalizedSection = normalizeSectionKey(sectionKey)
    const safeSessionId = String(sessionId || '').trim()
    const key = `${normalizedSection}::${safeSessionId}`

    if (!safeSessionId) {
      return
    }

    const prev = imageCellNodes.get(key)
    if (!node) {
      if (prev?.node) {
        const prevObserver = imageIntersectionObservers.get(prev.sectionKey)
        if (prevObserver) {
          prevObserver.unobserve(prev.node)
        }
        imageCellNodes.delete(key)
      }
      return
    }

    const observer = resolveImageCellObserver(normalizedSection)
    if (prev?.node && prev.node !== node) {
      const prevObserver = imageIntersectionObservers.get(prev.sectionKey)
      if (prevObserver) {
        prevObserver.unobserve(prev.node)
      }
    }

    if (node?.dataset) {
      node.dataset.diagnosisSessionId = safeSessionId
      node.dataset.sectionKey = normalizedSection
    }

    imageCellNodes.set(key, {
      sectionKey: normalizedSection,
      sessionId: safeSessionId,
      node
    })

    if (observer && !imageIntersectionAttempted.has(safeSessionId)) {
      observer.observe(node)
    }
  }

  const autoLoadPreviewTimers = new Map()

  function scheduleAutoLoadVisiblePreviewImages(sourceType = 'manual') {
    const normalizedSection = normalizeSectionKey(sourceType)
    const previousTimer = autoLoadPreviewTimers.get(normalizedSection)
    if (previousTimer) {
      clearTimeout(previousTimer)
    }
    const timer = setTimeout(() => {
      autoLoadPreviewTimers.delete(normalizedSection)
      autoLoadVisiblePreviewImages(normalizedSection)
    }, 0)
    autoLoadPreviewTimers.set(normalizedSection, timer)
  }

  async function autoLoadVisiblePreviewImages(sourceType = 'manual') {
    const currentState = stateForSource(sourceType)
    const rows = Array.isArray(currentState.items) ? currentState.items : []
    const candidates = rows.filter(row => {
      const sessionId = String(row?.diagnosisSessionId || '').trim()
      if (!sessionId || Number(row?.imageCount || 0) <= 0) {
        return false
      }
      if (resolveRowPreviewImage(row)) {
        return false
      }
      if (imageLoadingMap.value[sessionId]) {
        return false
      }
      return true
    })
    for (const row of candidates.slice(0, imagePrefetchBatchSize)) {
      await ensurePreviewImages(row, { silent: true })
    }
  }

  let previewLazyScanTimer = null
  let previewLazyEventsBound = false

  function bindPreviewLazyScanEvents() {
    if (previewLazyEventsBound || !isH5Runtime) {
      return
    }
    previewLazyEventsBound = true
    if (typeof document !== 'undefined') {
      document.addEventListener('scroll', schedulePreviewLazyScan, true)
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', schedulePreviewLazyScan)
    }
  }

  function unbindPreviewLazyScanEvents() {
    if (!previewLazyEventsBound) {
      return
    }
    previewLazyEventsBound = false
    if (typeof document !== 'undefined') {
      document.removeEventListener('scroll', schedulePreviewLazyScan, true)
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', schedulePreviewLazyScan)
    }
    if (previewLazyScanTimer) {
      clearTimeout(previewLazyScanTimer)
      previewLazyScanTimer = null
    }
  }

  function schedulePreviewLazyScan() {
    if (!isH5Runtime) {
      return
    }
    if (previewLazyScanTimer) {
      clearTimeout(previewLazyScanTimer)
    }
    previewLazyScanTimer = setTimeout(() => {
      previewLazyScanTimer = null
      scanVisiblePreviewImageCells()
    }, 80)
  }

  async function scanVisiblePreviewImageCells() {
    if (!isH5Runtime || typeof window === 'undefined') {
      return
    }
    const rowsToPrefetch = []
    for (const [key, node] of imageCellNodes.entries()) {
      if (!isPreviewImageCellVisible(node)) {
        continue
      }
      const { sessionId, sectionKey } = resolveImageCellIdentity(key, node)
      if (!sessionId || imageIntersectionAttempted.has(sessionId)) {
        continue
      }
      const row = findPreviewImageRow(sessionId, sectionKey)
      if (!row || resolveRowPreviewImage(row) || imageLoadingMap.value[sessionId]) {
        continue
      }
      imageIntersectionAttempted.add(sessionId)
      rowsToPrefetch.push(row)
      if (rowsToPrefetch.length >= imagePrefetchBatchSize) {
        break
      }
    }
    for (const row of rowsToPrefetch) {
      await ensurePreviewImages(row, { silent: true })
    }
  }

  function isPreviewImageCellVisible(node) {
    if (!node || typeof node.getBoundingClientRect !== 'function') {
      return false
    }
    const rect = node.getBoundingClientRect()
    const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 0
    const viewportWidth = window.innerWidth || document.documentElement?.clientWidth || 0
    const preload = 240
    return (
      rect.bottom >= -preload &&
      rect.top <= viewportHeight + preload &&
      rect.right >= -preload &&
      rect.left <= viewportWidth + preload
    )
  }

  function resolveImageCellIdentity(key, node) {
    const rawKey = String(key || '')
    const parts = rawKey.split(':')
    return {
      sessionId: String(node?.dataset?.diagnosisSessionId || parts[parts.length - 1] || '').trim(),
      sectionKey: String(node?.dataset?.sectionKey || (parts.length > 1 ? parts[0] : '')).trim()
    }
  }

  function findPreviewImageRow(sessionId = '', sectionKey = '') {
    const safeSessionId = String(sessionId || '').trim()
    if (!safeSessionId) {
      return null
    }
    const normalizedSection = String(sectionKey || '').trim()
    const knownSection = ['manual', 'batch', 'session'].includes(normalizedSection)
    const states = knownSection
      ? [stateForSource(normalizedSection)]
      : [manualListState.value, batchListState.value, sessionListState.value]
    for (const state of states) {
      const row = (Array.isArray(state?.items) ? state.items : []).find(
        item => item?.diagnosisSessionId === safeSessionId
      )
      if (row) {
        return row
      }
    }
    return null
  }

  return {
    normalizeSectionKey,
    resolveReviewRowBySessionId,
    clearImageObservers,
    resolveImageCellObserver,
    registerTableSectionRef,
    registerImageCellRef,
    scheduleAutoLoadVisiblePreviewImages,
    autoLoadVisiblePreviewImages,
    bindPreviewLazyScanEvents,
    unbindPreviewLazyScanEvents,
    schedulePreviewLazyScan,
    scanVisiblePreviewImageCells,
    isPreviewImageCellVisible,
    resolveImageCellIdentity,
    findPreviewImageRow
  }
}
