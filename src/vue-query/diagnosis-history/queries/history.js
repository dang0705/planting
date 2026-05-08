import { requestDiagnosisHistory, requestDiagnosisResult } from '@/http-functions/diagnose/client'
import { runVueQueryQuery } from '@/lib/vue-query-runtime.js'

export function buildDiagnosisHistoryQueryOptions(page = 1, pageSize = 10, plantId = null) {
  return {
    queryKey: ['http-function', 'diagnose-http', 'history', page, pageSize, plantId || 'all'],
    queryFn: async () =>
      requestDiagnosisHistory({
        page,
        pageSize,
        ...(plantId ? { userPlantId: plantId, plantId } : {})
      })
  }
}

export function fetchDiagnosisHistoryQuery(page = 1, pageSize = 10, plantId = null) {
  return runVueQueryQuery(buildDiagnosisHistoryQueryOptions(page, pageSize, plantId))
}

export function buildDiagnosisDetailQueryOptions(id) {
  return {
    queryKey: ['http-function', 'diagnose-http', 'history-detail', id],
    queryFn: async () => requestDiagnosisResult({ id }),
    enabled: Boolean(id)
  }
}

export function fetchDiagnosisDetailQuery(id) {
  return runVueQueryQuery(buildDiagnosisDetailQueryOptions(id))
}
