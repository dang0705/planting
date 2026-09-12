import { fetchDiagnosisHistoryQuery } from '@/vue-query/diagnosis-history/queries/history.js'

export async function getDiagnosisHistory({ page = 1, pageSize = 10, plantId = null } = {}) {
  return fetchDiagnosisHistoryQuery(page, pageSize, plantId)
}
