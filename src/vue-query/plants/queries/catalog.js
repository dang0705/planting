import { requestHttpFunction } from '@/api/http'
import { runVueQueryQuery } from '@/lib/vue-query-runtime.js'

export function buildPlantCatalogQueryOptions(keyword = '', page = 1, pageSize = 10) {
  return {
    queryKey: ['http-function', 'plant-catalog-http', 'catalog', keyword, page, pageSize],
    queryFn: async () =>
      requestHttpFunction('plant-catalog-http/catalog/plants', {
        query: {
          ...(keyword ? { keyword } : {}),
          page,
          pageSize
        },
        auth: true
      })
  }
}

export function fetchPlantCatalogQuery(keyword = '', page = 1, pageSize = 10) {
  return runVueQueryQuery(buildPlantCatalogQueryOptions(keyword, page, pageSize))
}

export function buildPlantCatalogMapQueryOptions(keyword) {
  return {
    queryKey: ['http-function', 'plant-catalog-http', 'catalog-map', keyword],
    queryFn: async () =>
      requestHttpFunction('plant-catalog-http/catalog/map', {
        query: { keyword },
        auth: true
      }),
    enabled: !!keyword
  }
}

export function fetchPlantCatalogMapQuery(keyword) {
  return runVueQueryQuery(buildPlantCatalogMapQueryOptions(keyword))
}
