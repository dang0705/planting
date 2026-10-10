import type { FrozenRoute } from '../../foundation/http/route-dispatcher.js'

/** weather-city-climate-fit/v2：列出城市气候剖面。 */
export const listCityClimateProfilesRoute: FrozenRoute = {
  method: 'GET',
  path: '/api/v2/weather/city-climate/profiles',
  operationId: 'listCityClimateProfiles',
  security: 'public'
}

/** 单个城市气候剖面。 */
export const getCityClimateProfileRoute: FrozenRoute = {
  method: 'GET',
  path: '/api/v2/weather/city-climate/profiles/{cityCode}',
  operationId: 'getCityClimateProfile',
  security: 'public'
}

/** 城×植物适配缓存。 */
export const getCityClimateFitRoute: FrozenRoute = {
  method: 'GET',
  path: '/api/v2/weather/city-climate/fit',
  operationId: 'getCityClimateFit',
  security: 'public'
}

/** 按城市推荐植物。 */
export const listCityClimateRecommendationsRoute: FrozenRoute = {
  method: 'GET',
  path: '/api/v2/weather/city-climate/recommendations',
  operationId: 'listCityClimateRecommendations',
  security: 'public'
}
