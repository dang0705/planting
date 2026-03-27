import { requestHttpFunction } from '@/api/http'
import { runVueQueryQuery } from '@/lib/vue-query-runtime.js'

export function buildDiagnosisHistoryQueryOptions(page = 1, pageSize = 10, plantId = null) {
  return {
    queryKey: ['http-function', 'diagnosis-history-http', 'history', page, pageSize, plantId || 'all'],
    queryFn: async () =>
      requestHttpFunction('diagnosis-history-http/diagnosis/history', {
        query: {
          page,
          pageSize,
          ...(plantId ? { plantId } : {})
        }
      })
  }
}

export function fetchDiagnosisHistoryQuery(page = 1, pageSize = 10, plantId = null) {
  return runVueQueryQuery(buildDiagnosisHistoryQueryOptions(page, pageSize, plantId))
}

export function buildDiagnosisDetailQueryOptions(id) {
  return {
    queryKey: ['http-function', 'diagnosis-history-http', 'history-detail', id],
    queryFn: async () =>
      requestHttpFunction('diagnosis-history-http/diagnosis/history/detail', {
        query: { id }
      }),
    enabled: !!id
  }
}

export function fetchDiagnosisDetailQuery(id) {
  return runVueQueryQuery(buildDiagnosisDetailQueryOptions(id))
}

export function buildDiagnosisDecisionQueryOptions(payload) {
  return {
    queryKey: ['http-function', 'diagnosis-history-http', 'decision', JSON.stringify(payload || {})],
    queryFn: async () =>
      requestHttpFunction('diagnosis-history-http/diagnosis/decision', {
        method: 'POST',
        body: payload
      })
  }
}

export function fetchDiagnosisDecisionQuery(payload) {
  return runVueQueryQuery(buildDiagnosisDecisionQueryOptions(payload))
}
