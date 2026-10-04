import type { FrozenRoute } from '../../foundation/http/route-dispatcher.js'

/** plant-encyclopedia-read/v1 新增 SQL 百科展示路由，不解析内部身份。 */
export const getPlantEncyclopediaRoute: FrozenRoute = {
  method: 'GET',
  path: '/api/v2/plant-knowledge/encyclopedia/{scientificNameSlug}',
  operationId: 'getPlantEncyclopedia',
  security: 'public'
}

/** plant-catalog-search/v1 冻结目录路由；与已发布身份搜索分开。 */
export const searchPlantCatalogRoute: FrozenRoute = {
  method: 'GET',
  path: '/api/v2/plant-knowledge/catalog/search',
  operationId: 'searchPlantCatalog',
  security: 'public'
}

/** route-registry.json 中 plant-knowledge 公开搜索的冻结登记；测试逐字段对照登记表。 */
export const searchPublishedPlantsRoute: FrozenRoute = {
  method: 'GET',
  path: '/api/v2/plant-knowledge/search',
  operationId: 'searchPublishedPlants',
  security: 'public'
}

/** route-registry.json 中 getPublishedPlant 的冻结登记；测试逐字段对照登记表。 */
export const getPublishedPlantRoute: FrozenRoute = {
  method: 'GET',
  path: '/api/v2/plant-knowledge/plants/{plantIdentityRef}',
  operationId: 'getPublishedPlant',
  security: 'public'
}
