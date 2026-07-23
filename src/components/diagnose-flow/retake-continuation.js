const CAPTURE_REGION_SLOT_TYPES = Object.freeze({
  leaf_lower_surface: 'leaf',
  leaf_upper_surface: 'leaf',
  leaf_edge: 'leaf',
  new_growth: 'leaf',
  stem_surface: 'stem',
  node_leaf_axil: 'stem',
  whole_plant_overview: 'whole_plant',
  root_surface: 'root',
  root_crown: 'root_crown',
  soil_surface: 'root_crown',
  flower: 'flower',
  fruit: 'fruit'
})

export function resolveRetakeUploadSlotType(requestedCaptureRegion = '') {
  return CAPTURE_REGION_SLOT_TYPES[String(requestedCaptureRegion || '').trim()] || 'other'
}

export function buildAuthorizedRetakeResult(currentResult = {}, authorization = {}) {
  return {
    ...currentResult,
    retakeAuthorizationState: authorization,
    retakeRequest: {
      ...currentResult?.retakeRequest,
      serverAuthorized: true,
      status: 'authorized'
    }
  }
}

export function preserveDiagnosisContinuationContext(
  nextResult = {},
  previousResult = {},
  payload = {}
) {
  const fallback = { ...payload, ...previousResult }
  const contextFields = [
    'diagnosisSessionId',
    'plantId',
    'userPlantId',
    'plantCatalogId',
    'plantIdentityId',
    'latestVisualCallBatchId',
    'visualBatchTrace'
  ]
  const preservedContext = Object.fromEntries(
    contextFields
      .filter(
        field =>
          nextResult?.[field] === null ||
          nextResult?.[field] === undefined ||
          nextResult?.[field] === ''
      )
      .map(field => [field, fallback?.[field]])
      .filter(([, value]) => value !== null && value !== undefined && value !== '')
  )
  return { ...nextResult, ...preservedContext }
}

export function buildRetakeImageAnswerPayload({ result = {}, structuredImages = [] } = {}) {
  const requestedCaptureRegion = String(
    result?.retakeAuthorizationState?.requestedCaptureRegion ||
      result?.retakeRequest?.requestedCaptureRegion ||
      ''
  ).trim()
  const images = (Array.isArray(structuredImages) ? structuredImages : []).map(item => ({
    ...item,
    ...(requestedCaptureRegion ? { captureRegion: requestedCaptureRegion } : {})
  }))
  const imageIds = images.map(item => item.imageRef).filter(Boolean)

  return {
    diagnosisSessionId: result?.diagnosisSessionId || '',
    roundId: result?.roundId || '',
    image: imageIds[0] || '',
    images,
    imageIds,
    latestVisualCallBatchId: result?.latestVisualCallBatchId || null,
    visualBatchTrace: result?.visualBatchTrace || null,
    retakeAuthorizationId: result?.retakeAuthorizationState?.retakeAuthorizationId || '',
    requestedCaptureRegion,
    originVisualCallBatchId: result?.retakeAuthorizationState?.originVisualCallBatchId || ''
  }
}
