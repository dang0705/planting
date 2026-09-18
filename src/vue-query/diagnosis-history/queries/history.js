import { requestHttpFunction } from '@/api/http'
import { queryClient } from '@/lib/query-client.js'
import { runVueQueryQuery } from '@/lib/vue-query-runtime.js'
import { DIAGNOSIS_HISTORY_QUERY_KEY } from '@/constants/query-keys.js'

function normalizeHistoryItem(item = {}) {
  return {
    ...item,
    resultId: item.resultId || item.historyId || item._id || item.diagnosisSessionId || '',
    historyId: item.historyId || item._id || item.diagnosisSessionId || item.resultId || ''
  }
}

function normalizeHistoryResponse(response) {
  const payload = response?.data && typeof response.data === 'object' ? response.data : response
  const items = Array.isArray(payload?.items)
    ? payload.items
    : Array.isArray(payload?.list)
      ? payload.list
      : Array.isArray(payload)
        ? payload
        : []
  return {
    ...(payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {}),
    items: items.map(normalizeHistoryItem)
  }
}

function unwrapHistoryResponse(response) {
  const code = Number(response?.code ?? 200)
  if (code !== 200) {
    throw new Error(response?.message || '读取诊断历史失败')
  }
  return normalizeHistoryResponse(response?.data ?? response)
}

export function buildDiagnosisHistoryQueryOptions(page = 1, pageSize = 10, plantId = null) {
  return {
    queryKey: [...DIAGNOSIS_HISTORY_QUERY_KEY, page, pageSize, plantId || 'all'],
    queryFn: async () =>
      unwrapHistoryResponse(
        await requestHttpFunction('diagnose-http/diagnosis/history', {
          query: {
            page,
            pageSize,
            ...(plantId ? { userPlantId: plantId, plantId } : {})
          }
        })
      )
  }
}

export function fetchDiagnosisHistoryQuery(page = 1, pageSize = 10, plantId = null) {
  return runVueQueryQuery(buildDiagnosisHistoryQueryOptions(page, pageSize, plantId))
}

export function invalidateDiagnosisHistoryQueries() {
  return queryClient.invalidateQueries({ queryKey: DIAGNOSIS_HISTORY_QUERY_KEY })
}
