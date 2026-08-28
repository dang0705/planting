import { requestHttpFunction } from './http.js'

function normalizeHistoryItem(item = {}) {
  return {
    ...item,
    resultId: item.resultId || item.historyId || item._id || item.diagnosisSessionId || '',
    historyId: item.historyId || item._id || item.diagnosisSessionId || item.resultId || ''
  }
}

export async function getDiagnosisHistory({ page = 1, pageSize = 10, plantId = null } = {}) {
  const response = await requestHttpFunction('diagnose-http/diagnosis/history', {
    method: 'GET',
    query: {
      page,
      pageSize,
      ...(plantId ? { userPlantId: plantId, plantId } : {})
    }
  })
  const payload = response?.data && typeof response.data === 'object' ? response.data : response
  const items = Array.isArray(payload?.items)
    ? payload.items
    : Array.isArray(payload)
      ? payload
      : []
  return {
    ...(payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {}),
    items: items.map(normalizeHistoryItem)
  }
}
