import { requestHttpFunction } from '@/api/http'
import { runVueQueryQuery } from '@/lib/vue-query-runtime.js'

export function buildWateringReminderQueryKey(plantId) {
  return ['http-function', 'plant-user-http', 'watering-reminders', plantId]
}

export function buildWateringReminderQueryOptions(plantId) {
  return {
    queryKey: buildWateringReminderQueryKey(plantId),
    queryFn: async () =>
      requestHttpFunction('plant-user-http/user-plants/watering-reminders', {
        query: { plantId }
      })
  }
}

export function fetchWateringReminderQuery(plantId) {
  return runVueQueryQuery(buildWateringReminderQueryOptions(plantId))
}
