'use strict'

const {
  jsonResponse,
  notFound,
  methodNotAllowed,
  getHttpRequestData,
  resolveRequestAppEnv,
  runWithRequestAppEnv,
  resolveHttpUserInfo
} = require('/opt/utils/http')
const {
  createUserPlantInstance,
  listUserPlantInstances,
  updateUserPlantInstance,
  deleteUserPlantInstance,
  getUserPlantInstanceById,
  getUserPlantWateringStrategy
} = require('/opt/utils/plant-knowledge')
const {
  buildWateringPlanner,
  normalizeCareBehaviorTimeline
} = require('/opt/utils/watering-planner')
const {
  attachCareLocation,
  attachCareLocationsToList,
  savePlantCareLocation
} = require('./care-location-service')

async function main(event, context) {
  const request = getHttpRequestData(event, context)
  const path = String(request.path || '')
  const method = request.method || 'GET'

  try {
    if (path.includes('/user-plants/health')) {
      return jsonResponse(200, { code: 200, data: { status: 'ok', timestamp: Date.now() } })
    }

    if (!path.includes('/user-plants')) {
      return notFound(path)
    }

    const userInfo = await resolveHttpUserInfo(request.headers, request.query, context)
    if (!userInfo?.openid) {
      return jsonResponse(401, { code: 401, message: '请先登录', data: null })
    }
    const openid = userInfo.openid

    // 浇水规划器接口：接收 10 天浇水事件集合 + 天气数据，返回下次浇水建议
    if (path.includes('/watering-planner')) {
      if (method !== 'POST') {
        return methodNotAllowed(method)
      }
      const plantId = Number(request.body.plantId || request.query.plantId)
      if (!plantId) {
        return jsonResponse(400, { code: 400, message: '缺少植物ID', data: null })
      }
      // 精简查询：仅取 planner 所需的属级浇水策略 + 温湿度 bounds，不走 getUserPlantInstanceById 的 3 次串行 SQL
      const strategy = await getUserPlantWateringStrategy(openid, plantId)
      if (!strategy) {
        return jsonResponse(404, { code: 404, message: '植物不存在或无权限', data: null })
      }
      const wateringEvents = Array.isArray(request.body.wateringEvents)
        ? request.body.wateringEvents
        : []
      const referenceDate =
        request.body.referenceDate || new Date().toISOString().slice(0, 10)

      // 从前端传入的天气数据构建历史/预报摘要
      const weatherDays = Array.isArray(request.body.weatherDays)
        ? request.body.weatherDays
        : []
      const forecastWeatherDays = Array.isArray(request.body.forecastDays)
        ? request.body.forecastDays
        : []
      const historical = buildWeatherSummary(weatherDays.slice(0, 10), strategy)
      const forecast = buildWeatherSummary(forecastWeatherDays.slice(0, 15), strategy)

      const timeline = normalizeCareBehaviorTimeline({
        referenceDate,
        watering_events_10d: wateringEvents
      })
      const plan = buildWateringPlanner({
        wateringStrategy: strategy.watering || {},
        historical,
        forecast,
        behaviorTimeline: timeline,
        referenceDate
      })
      return jsonResponse(200, {
        code: 200,
        data: {
          nextWaterDate: plan.nextWaterDate,
          nextWaterWindow: plan.nextWaterWindow,
          nextWaterReason: plan.nextWaterReason,
          wateringContext: plan.wateringContext,
          action: plan.action
        }
      })
    }

    if (method === 'GET') {
      const data = await listUserPlantInstances(openid, {
        page: Number(request.query.page || 1),
        pageSize: Number(request.query.pageSize || 20)
      })
      const enrichedData = await attachCareLocationsToList({ openid, data })
      return jsonResponse(200, { code: 200, data: enrichedData })
    }

    if (method === 'POST') {
      const created = await createUserPlantInstance({
        openid,
        plantId: request.body.plantId || null,
        plantIdentityId: request.body.plantIdentityId || null,
        sessionPlantId: request.body.sessionPlantId || null,
        recognizedName: request.body.recognizedName || null,
        sourceType: request.body.sourceType || 'catalog',
        recognitionType: request.body.recognitionType || null,
        recognitionConfidence: request.body.recognitionConfidence || null,
        identityResolutionStatus: request.body.identityResolutionStatus || null,
        visualCallBatchId: request.body.visualCallBatchId || null,
        nickname: request.body.nickname || request.body.nickName || null,
        location: request.body.location || '阳台',
        lightEnvironment: Object.prototype.hasOwnProperty.call(
          request.body || {},
          'lightEnvironment'
        )
          ? request.body.lightEnvironment
          : null,
        photos: request.body.photos || null
      })
      const careLocation = await savePlantCareLocation({
        openid,
        plantId: created?.id,
        careLocation: request.body.careLocation || request.body.plantCareLocation || null
      })
      return jsonResponse(200, {
        code: 200,
        message: '保存成功',
        data: attachCareLocation(created, careLocation)
      })
    }

    if (method === 'PATCH') {
      const id = Number(request.body.id || request.query.id)
      if (!id) {
        return jsonResponse(400, { code: 400, message: '缺少植物ID', data: null })
      }
      const updated = await updateUserPlantInstance(openid, id, request.body)
      const careLocation = await savePlantCareLocation({
        openid,
        plantId: id,
        careLocation: request.body.careLocation || request.body.plantCareLocation || null
      })
      return jsonResponse(200, {
        code: 200,
        message: '更新成功',
        data: attachCareLocation(updated, careLocation)
      })
    }

    if (method === 'DELETE') {
      const id = Number(request.body.id || request.query.id)
      if (!id) {
        return jsonResponse(400, { code: 400, message: '缺少植物ID', data: null })
      }
      await deleteUserPlantInstance(openid, id)
      return jsonResponse(200, { code: 200, message: '删除成功', data: { id } })
    }

    return methodNotAllowed(method)
  } catch (error) {
    console.error('plant-user-http error:', error)
    return jsonResponse(500, { code: 500, message: error.message, data: null })
  }
}

module.exports.main = (event, context) => {
  const request = getHttpRequestData(event, context)
  const appEnv = resolveRequestAppEnv(request.headers, request.query, request.body)
  return runWithRequestAppEnv(appEnv, () => main(event, context))
}

/**
 * 从前端天气日数据（environmentWeatherWindow.historicalDays）构建 planner 所需的摘要。
 * 适配实际字段名：tempMaxC / tempMinC / humidity / precipMm / textDay。
 * 提取 highHumidityDays / coldHumidDays / rainyDays / hotDryDays 等字段。
 */
function buildWeatherSummary(dailyRecords = [], plantContext = {}) {
  const humidityMax = Number(plantContext.humidityMax || 75)
  const humidityMin = Number(plantContext.humidityMin || 35)
  const tempMax = Number(plantContext.temperatureMax || 30)
  const tempMin = Number(plantContext.temperatureMin || 12)
  const summary = {
    highHumidityDays: 0,
    coldHumidDays: 0,
    rainyDays: 0,
    hotDryDays: 0,
    maxConsecutiveHighHumidityDays: 0,
    maxConsecutiveColdHumidDays: 0,
    maxConsecutiveRainyDays: 0,
    maxConsecutiveHotDryDays: 0
  }
  let streakHigh = 0
  let streakCold = 0
  let streakRain = 0
  let streakDry = 0
  for (const record of dailyRecords) {
    if (!record || typeof record !== 'object') continue
    // 适配 historicalDays 实际字段名 tempMaxC/tempMinC/precipMm/textDay
    const humidity = Number(record.humidity ?? record.humidityPercent)
    const tempMaxVal = Number(record.tempMaxC ?? record.tempMax ?? record.temperatureMax ?? record.dayMaxTemp)
    const tempMinVal = Number(record.tempMinC ?? record.tempMin ?? record.temperatureMin ?? record.dayMinTemp)
    const precipitation = Number(record.precipMm ?? record.precipitation ?? record.precip ?? 0)
    const weatherText = String(record.textDay ?? record.weatherText ?? record.weather ?? '')
    const isHighHumidity = !isNaN(humidity) && humidity > humidityMax
    const isLowHumidity = !isNaN(humidity) && humidity < humidityMin
    const isHot = !isNaN(tempMaxVal) && tempMaxVal > tempMax
    const isCold = !isNaN(tempMinVal) && tempMinVal < tempMin
    const isRainy = precipitation > 0 || /雨|rain|shower/i.test(weatherText)
    if (isHighHumidity) summary.highHumidityDays++
    if (isCold && isHighHumidity) summary.coldHumidDays++
    if (isRainy) summary.rainyDays++
    if (isHot && isLowHumidity) summary.hotDryDays++
    streakHigh = isHighHumidity ? streakHigh + 1 : 0
    streakCold = isCold && isHighHumidity ? streakCold + 1 : 0
    streakRain = isRainy ? streakRain + 1 : 0
    streakDry = isHot && isLowHumidity ? streakDry + 1 : 0
    summary.maxConsecutiveHighHumidityDays = Math.max(summary.maxConsecutiveHighHumidityDays, streakHigh)
    summary.maxConsecutiveColdHumidDays = Math.max(summary.maxConsecutiveColdHumidDays, streakCold)
    summary.maxConsecutiveRainyDays = Math.max(summary.maxConsecutiveRainyDays, streakRain)
    summary.maxConsecutiveHotDryDays = Math.max(summary.maxConsecutiveHotDryDays, streakDry)
  }
  return summary
}
