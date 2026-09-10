'use strict'

const {
  getUserPlantWateringEvents,
  getUserPlantWateringStrategy
} = require('/opt/utils/plant-knowledge')
const {
  buildWateringPlanner,
  normalizeCareBehaviorTimeline
} = require('/opt/utils/watering-planner')
const { buildWeatherSummary, injectD0IntoForecastDays } = require('./watering-planner-service')
const { getUserPlantLightEnvironment } = require('/opt/utils/user-plant-light-environment')
const {
  computeTranspirationIntervalFactor,
  resolveShadowModeFromEnv
} = require('/opt/utils/transpiration')
const { resolveAirEnvironmentEvidence } = require('/opt/utils/air-environment-evidence')

function getTodayInChina() {
  const chinaNow = new Date(Date.now() + 8 * 60 * 60 * 1000)
  return chinaNow.toISOString().slice(0, 10)
}

async function resolveServerWateringPlan(openid, plantId, body = {}) {
  const strategy = await getUserPlantWateringStrategy(openid, plantId)
  if (!strategy) {
    const error = new Error('植物不存在或无权限')
    error.statusCode = 404
    throw error
  }
  const persistedEvents = await getUserPlantWateringEvents(openid, plantId, 30)
  const requestedEvents = Array.isArray(body.wateringEvents) ? body.wateringEvents : []
  const weatherDays = Array.isArray(body.weatherDays) ? body.weatherDays : []
  const forecastDays = Array.isArray(body.forecastDays) ? body.forecastDays : []
  const locationKey = String(body.locationKey || '').trim()
  const timezone = String(body.timezone || 'Asia/Shanghai').trim() || 'Asia/Shanghai'
  const { forecastDays: forecastWithD0, referenceDate } = await injectD0IntoForecastDays({
    locationKey,
    timezone,
    referenceDate: getTodayInChina(),
    forecastDays: forecastDays.slice(0, 15)
  })
  const historical = buildWeatherSummary(weatherDays.slice(0, 10), strategy)
  const forecast = buildWeatherSummary(forecastWithD0.slice(0, 15), strategy)
  const timeline = normalizeCareBehaviorTimeline({
    referenceDate,
    watering_events_10d: requestedEvents.length ? requestedEvents : persistedEvents || [],
    baselineIntervalDays: strategy.watering?.freq || strategy.watering?.intervalDays
  })
  if (!(timeline.watering_events_10d || []).length) {
    const error = new Error('请先填写过往浇水日期')
    error.statusCode = 409
    error.requiresWateringHistory = true
    throw error
  }
  const lightEnvironment = await getUserPlantLightEnvironment(openid, plantId)
  const airEnvironmentEvidence = resolveAirEnvironmentEvidence(body.airEnvironmentOverride)
  const transpiration = computeTranspirationIntervalFactor({
    lightEnvironment: lightEnvironment || null,
    weatherDays: weatherDays.slice(0, 10),
    weatherSummary: historical,
    airEnvironmentEvidence,
    plantStrategy: strategy.wateringQuantization
      ? { wateringQuantization: strategy.wateringQuantization }
      : null,
    shadow: resolveShadowModeFromEnv(process.env)
  })
  const plan = buildWateringPlanner({
    wateringStrategy: strategy.watering || {},
    historical,
    forecast,
    behaviorTimeline: timeline,
    potProfile: strategy.potProfile || null,
    wateringQuantization: strategy.wateringQuantization || null,
    referenceDate,
    transpirationIntervalFactor: transpiration.intervalFactor
  })
  if (!plan.nextWaterDate) {
    const error = new Error('当前没有可添加的浇水日期')
    error.statusCode = 409
    throw error
  }
  return { strategy, timeline, plan }
}

module.exports = { resolveServerWateringPlan }
