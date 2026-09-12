import { requestDiagnosisResult } from '../../../http-functions/diagnose/client.js'
import { runVueQueryQuery } from '@/lib/vue-query-runtime.js'
import { DIAGNOSIS_HISTORY_QUERY_KEY } from '@/constants/query-keys.js'
export {
  buildDiagnosisHistoryQueryOptions,
  fetchDiagnosisHistoryQuery,
  invalidateDiagnosisHistoryQueries
} from '@/vue-query/diagnosis-history/queries/history.js'
export { DIAGNOSIS_HISTORY_QUERY_KEY }

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
