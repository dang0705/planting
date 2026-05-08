import { requestHttpFunction } from '@/api/http'
import { runVueQueryQuery } from '@/lib/vue-query-runtime.js'

export function buildPlantImagesQueryOptions(plantId, limit = 10, offset = 0) {
  return {
    queryKey: ['http-function', 'storage-http', 'plant-images', plantId, limit, offset],
    queryFn: async () =>
      requestHttpFunction('storage-http/storage/plant-images', {
        query: {
          plantId,
          limit,
          offset
        }
      }),
    enabled: Boolean(plantId)
  }
}

export function fetchPlantImagesQuery(plantId, limit = 10, offset = 0) {
  return runVueQueryQuery(buildPlantImagesQueryOptions(plantId, limit, offset))
}
