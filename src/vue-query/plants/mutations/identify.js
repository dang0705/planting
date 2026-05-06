import { requestHttpFunction } from '@/api/http'
import { runVueQueryMutation } from '@/lib/vue-query-runtime.js'

function buildIdentifyPlantMutationOptions() {
  return {
    mutationKey: ['http-function', 'identify-http', 'identify-plant'],
    mutationFn: async imageUrl =>
      requestHttpFunction('identify-http/identify/plant', {
        method: 'POST',
        body: { imageUrl }
      })
  }
}

export function executeIdentifyPlantMutation(imageUrl) {
  return runVueQueryMutation(buildIdentifyPlantMutationOptions(), imageUrl)
}
