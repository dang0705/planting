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
const {
  attachWateringReminderStateToList,
  readWateringReminder,
  saveWateringReminder
} = require('./watering-reminder-service')
const { buildWeatherSummary, computeAdhocPlanner } = require('./watering-planner-service')
const { saveAdvisorSession, listAdvisorSessions } = require('./watering-advisor-service')
const {
  computeTranspirationIntervalFactor,
  resolveShadowModeFromEnv
} = require('/opt/utils/transpiration')

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

    if (path.includes('/watering-reminders')) {
      const plantId = Number(request.body.plantId || request.query.plantId)
      if (!plantId) {
        return jsonResponse(400, { code: 400, message: '缺少植物ID', data: null })
      }
      if (method === 'GET') {
        const result = await readWateringReminder(openid, plantId)
        return jsonResponse(result.statusCode, {
          code: result.statusCode,
          message: result.data ? '读取成功' : '暂无有效提醒',
          data: result.data
        })
      }
      if (method === 'POST') {
        try {
          const result = await saveWateringReminder(openid, request.body)
          return jsonResponse(result.statusCode, {
            code: result.statusCode,
            message: result.message,
            data: result.data
          })
        } catch (error) {
          const diagnostic = buildWateringReminderErrorDiagnostic(error)
          console.error(
            'watering reminder save error:',
            JSON.stringify({
              errorCode: diagnostic.errorCode,
              errorMessage: diagnostic.errorMessage
            })
          )
          return jsonResponse(500, {
            code: 500,
            message: '浇水提醒表未就绪或保存失败，请稍后重试',
            data: diagnostic
          })
        }
      }
      return methodNotAllowed(method)
    }

    // 独立浇水建议接口：不绑定用户植物，基于植物种类 + 临时盆型输入
    // 必须在 /watering-planner 之前判断（includes 匹配，watering-advisor 会先命中）
    if (path.includes('/watering-advisor')) {
      if (method === 'POST') {
        // 区分 compute（计算建议）和 save（落库）两种 POST 操作
        const action = String(request.body.action || 'compute')
        if (action === 'save') {
          try {
            const result = await saveAdvisorSession(openid, request.body)
            return jsonResponse(result.statusCode, {
              code: result.statusCode,
              message: result.message,
              data: result.data
            })
          } catch (error) {
            console.error('watering advisor save error:', error?.message || error)
            return jsonResponse(500, {
              code: 500,
              message: '保存失败，请稍后重试',
              data: null
            })
          }
        }
        // compute
        const result = await computeAdhocPlanner({
          catalogPlantId: String(request.body.catalogPlantId || '').trim(),
          potProfile: request.body.potProfile || null,
          weatherDays: Array.isArray(request.body.weatherDays) ? request.body.weatherDays : [],
          forecastDays: Array.isArray(request.body.forecastDays) ? request.body.forecastDays : [],
          referenceDate: request.body.referenceDate || new Date().toISOString().slice(0, 10)
        })
        return jsonResponse(result.statusCode, {
          code: result.statusCode,
          message: result.error || '计算成功',
          data: result.data || null
        })
      }
      if (method === 'GET') {
        const result = await listAdvisorSessions(openid, {
          page: Number(request.query.page || 1),
          pageSize: Number(request.query.pageSize || 20)
        })
        return jsonResponse(result.statusCode, {
          code: result.statusCode,
          message: '查询成功',
          data: result.data
        })
      }
      return methodNotAllowed(method)
    }

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
      const referenceDate = request.body.referenceDate || new Date().toISOString().slice(0, 10)

      // 从前端传入的天气数据构建历史/预报摘要
      const weatherDays = Array.isArray(request.body.weatherDays) ? request.body.weatherDays : []
      const forecastWeatherDays = Array.isArray(request.body.forecastDays)
        ? request.body.forecastDays
        : []
      const historical = buildWeatherSummary(weatherDays.slice(0, 10), strategy)
      const forecast = buildWeatherSummary(forecastWeatherDays.slice(0, 15), strategy)

      const timeline = normalizeCareBehaviorTimeline({
        referenceDate,
        watering_events_10d: wateringEvents
      })

      // v3 蒸腾间隔修正：仅影响"我的植物"下次浇水间隔（BASELINE 间隔），
      // 不影响单次浇水毫升数（amountRangeMl 由 hydration-load 独立计算），
      // 也不绕过 WET/DRY Gate 保护。默认影子运行（intervalFactor=1.0）。
      const transpirationShadow = resolveShadowModeFromEnv(process.env)
      const transpiration = computeTranspirationIntervalFactor({
        lightEnvironment: strategy.lightEnvironment || null,
        weatherDays: weatherDays.slice(0, 10),
        weatherSummary: historical,
        plantStrategy: strategy.wateringQuantization
          ? { wateringQuantization: strategy.wateringQuantization }
          : null,
        shadow: transpirationShadow
      })

      // 业务始终采用 legacy（factor=1.0）结果；shadow 模式额外计算 candidate 供审计比较。
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

      // 影子模式：计算 candidate（computedFactor）的 BASELINE 日期/窗口，用于比较但不影响业务结果。
      let candidateNextWaterDate = null
      let candidateNextWaterWindow = null
      if (transpirationShadow && transpiration.computedFactor !== 1.0) {
        const candidatePlan = buildWateringPlanner({
          wateringStrategy: strategy.watering || {},
          historical,
          forecast,
          behaviorTimeline: timeline,
          potProfile: strategy.potProfile || null,
          wateringQuantization: strategy.wateringQuantization || null,
          referenceDate,
          transpirationIntervalFactor: transpiration.computedFactor
        })
        candidateNextWaterDate = candidatePlan.nextWaterDate
        candidateNextWaterWindow = candidatePlan.nextWaterWindow
      }

      const planId = `plan_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
      return jsonResponse(200, {
        code: 200,
        data: {
          planId,
          nextWaterDate: plan.nextWaterDate,
          nextWaterWindow: plan.nextWaterWindow,
          nextWaterReason: plan.nextWaterReason,
          wateringContext: plan.wateringContext,
          action: plan.action,
          amountRangeMl: plan.amountRangeMl,
          potVolumeMl: plan.potGeometry?.potVolumeMl ?? 0,
          stopCondition: plan.stopCondition,
          confidenceLevel: plan.confidenceLevel,
          reasonCodes: plan.reasonCodes,
          effectiveHydrationLoad: plan.effectiveHydrationLoad,
          wetPressureLoad: plan.wetPressureLoad,
          lastEffectiveRootWateredDaysAgo: plan.lastEffectiveRootWateredDaysAgo,
          rootZoneMoistureIndex: plan.rootZoneMoistureIndex,
          userDoseEcho: plan.userDoseEcho,
          // v3 蒸腾间隔修正审计字段
          transpirationIntervalFactor: plan.transpirationIntervalFactor,
          transpirationShadow: transpiration.shadow,
          transpirationComputedFactor: transpiration.computedFactor,
          transpirationCandidateNextWaterDate: candidateNextWaterDate,
          transpirationCandidateNextWaterWindow: candidateNextWaterWindow
        }
      })
    }

    if (method === 'GET') {
      const data = await listUserPlantInstances(openid, {
        page: Number(request.query.page || 1),
        pageSize: Number(request.query.pageSize || 20)
      })
      const enrichedData = await attachCareLocationsToList({ openid, data })
      const reminderData = await attachWateringReminderStateToList(openid, enrichedData)
      return jsonResponse(200, { code: 200, data: reminderData })
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
module.exports._test = { main, buildWateringReminderErrorDiagnostic }

function sanitizeErrorMessage(error) {
  return String(error?.message || error || '')
    .replace(/(secretId|secretKey|token|authorization)\s*[:=]\s*[^,\s]+/gi, '$1=[redacted]')
    .slice(0, 500)
}

function buildWateringReminderErrorDiagnostic(error) {
  const message = sanitizeErrorMessage(error)
  if (
    /ER_NO_SUCH_TABLE|no such table|doesn't exist|does not exist|user_watering_reminder_events/i.test(
      message
    )
  ) {
    return {
      errorCode: 'WATERING_REMINDER_TABLE_NOT_READY',
      errorMessage: message || 'user_watering_reminder_events is not ready'
    }
  }
  if (/invalid json|json text|json value/i.test(message)) {
    return {
      errorCode: 'WATERING_REMINDER_INVALID_JSON',
      errorMessage: message
    }
  }
  if (/permission|denied|access/i.test(message)) {
    return {
      errorCode: 'WATERING_REMINDER_SQL_PERMISSION_DENIED',
      errorMessage: message
    }
  }
  return {
    errorCode: 'WATERING_REMINDER_SAVE_FAILED',
    errorMessage: message || 'unknown watering reminder save error'
  }
}
