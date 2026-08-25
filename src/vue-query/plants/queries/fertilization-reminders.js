import { requestHttpFunction } from '@/api/http.js'
import { runVueQueryQuery } from '@/lib/vue-query-runtime.js'

export function buildFertilizationReminderQueryKey(plantId) {
  return ['http-function', 'plant-user-http', 'fertilization-reminders', plantId]
}

export function buildFertilizationReminderQueryOptions(plantId) {
  return {
    queryKey: buildFertilizationReminderQueryKey(plantId),
    queryFn: async () => requestFertilizationReminder(plantId)
  }
}

function requestFertilizationReminder(plantId) {
  return requestHttpFunction('plant-user-http/user-plants/fertilization-reminders', {
    query: { plantId: Number(plantId) }
  })
}

export function fetchFertilizationReminderQuery(plantId) {
  return runVueQueryQuery(buildFertilizationReminderQueryOptions(plantId))
}

export function fetchFertilizationReminderFresh(plantId) {
  return requestFertilizationReminder(plantId)
}
