'use strict'

// The CloudBase Node 18.15 runtime does not expose the Web File global, while
// some transitive SDK releases load undici during startup and expect it.
if (typeof globalThis.File !== 'function') {
  globalThis.File = class File {}
}

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
  getUserPlantInstanceById,
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
const {
  attachFertilizationReminderStateToList,
  cancelFertilizationReminder,
  completeFertilizationReminder,
  confirmFertilizationReminder,
  dismissFertilizationReminder,
  previewFertilizationReminder,
  readFertilizationReminder
} = require('./fertilization-reminder-service')
const {
  buildWeatherSummary,
  computeAdhocPlanner,
  injectD0IntoForecastDays
} = require('./watering-planner-service')
const {
  saveAdvisorSession,
  confirmAdvisorSessionWatered,
  listAdvisorSessions
} = require('./watering-advisor-service')
const {
  computeTranspirationIntervalFactor,
  resolveShadowModeFromEnv
} = require('/opt/utils/transpiration')
const { getUserPlantLightEnvironment } = require('/opt/utils/user-plant-light-environment')
const {
  readUserPlantAirEnvironment,
  saveUserPlantAirEnvironment
} = require('./air-environment-service')
const { resolveAirEnvironmentEvidence } = require('/opt/utils/air-environment-evidence')
let normalizeUserLightContext
try {
  ;({ normalizeUserLightContext } = require('/opt/utils/light-exposure-normalize'))
} catch {
  ;({ normalizeUserLightContext } = require('../layer/utils/light-exposure-normalize'))
}

function normalizePersistedLightEnvironment(value) {
  if (value === null || value === undefined) {
    return null
  }
  const normalized = normalizeUserLightContext(value)
  if (!normalized.hasMeaningfulInput) {
    return null
  }
  return {
    schemaVersion: 2,
    naturalLightType: normalized.naturalLightType,
    entryMethod: normalized.entryMethod,
    hasSupplementalLight: normalized.hasSupplementalLight,
    captureSource: normalized.captureSource
  }
}

async function main(event, context) {
  const request = getHttpRequestData(event, context)
  const path = String(request.path || '').split('?')[0]
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

    if (path.includes('/air-environment')) {
      const plantId = Number(request.body.plantId || request.query.plantId)
      if (method === 'GET') {
        const result = await readUserPlantAirEnvironment(openid, plantId)
        return jsonResponse(result.statusCode, {
          code: result.statusCode,
          message: result.message,
          data: result.data
        })
      }
      if (method === 'PATCH') {
        const result = await saveUserPlantAirEnvironment(openid, request.body)
        return jsonResponse(result.statusCode, {
          code: result.statusCode,
          message: result.message,
          data: result.data
        })
      }
      return methodNotAllowed(method)
    }

    if (path.includes('/fertilization-reminders')) {
      const plantId = Number(request.body.plantId || request.query.plantId)
      if (method === 'GET') {
        if (!plantId) {
          return jsonResponse(400, { code: 400, message: '缺少植物ID', data: null })
        }
        const result = await readFertilizationReminder(openid, plantId)
        return jsonResponse(result.statusCode, {
          code: result.statusCode,
          message: result.message,
          data: result.data
        })
      }
      if (method !== 'POST') {
        return methodNotAllowed(method)
      }
      const action = path.split('/').filter(Boolean).pop()
      const actionHandlers = {
        preview: previewFertilizationReminder,
        confirm: confirmFertilizationReminder,
        complete: completeFertilizationReminder,
        dismiss: dismissFertilizationReminder,
        cancel: cancelFertilizationReminder
      }
      const handler = actionHandlers[action]
      if (!handler) {
        return methodNotAllowed(method)
      }
      const result = await handler(openid, request.body || {})
      return jsonResponse(result.statusCode, {
        code: result.statusCode,
        message: result.message,
        data: result.data
      })
    }

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
        if (action === 'confirm_watered') {
          try {
            const result = await confirmAdvisorSessionWatered(openid, request.body)
            return jsonResponse(result.statusCode, {
              code: result.statusCode,
              message: result.message,
              data: result.data
            })
          } catch (error) {
            console.error('watering advisor confirm error:', error?.message || error)
            return jsonResponse(500, {
              code: 500,
              message: '记录浇水失败，请稍后重试',
              data: null
            })
          }
        }
        // compute
        const result = await computeAdhocPlanner({
          openid,
          catalogPlantId: String(request.body.catalogPlantId || '').trim(),
          potProfile: request.body.potProfile || null,
          weatherDays: Array.isArray(request.body.weatherDays) ? request.body.weatherDays : [],
          forecastDays: Array.isArray(request.body.forecastDays) ? request.body.forecastDays : [],
          referenceDate: request.body.referenceDate || '',
          locationKey: String(request.body.locationKey || '').trim(),
          timezone: String(request.body.timezone || 'Asia/Shanghai').trim() || 'Asia/Shanghai',
          lightEnvironment: request.body.lightEnvironment || null,
          airEnvironmentOverride: request.body.airEnvironmentOverride || null,
          wateringEvents: Array.isArray(request.body.wateringEvents)
            ? request.body.wateringEvents
            : []
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
      // locationKey 统一从 plant.careLocation.locationKey 读取（前端从植物详情获取后传入）；
      // timezone 用于 referenceDate 时区修正（默认 Asia/Shanghai），修复原 UTC slice 导致的日期错位。
      const locationKey = String(request.body.locationKey || '').trim()
      const timezone = String(request.body.timezone || 'Asia/Shanghai').trim() || 'Asia/Shanghai'

      // 从前端传入的天气数据构建历史/预报摘要
      const weatherDays = Array.isArray(request.body.weatherDays) ? request.body.weatherDays : []
      const forecastWeatherDays = Array.isArray(request.body.forecastDays)
        ? request.body.forecastDays
        : []

      // D0 注入：前端传 D+1..D+14（14 项），后端从 day file latestSample 注入 D0 作为当日天气。
      // 命中时 forecast 为 15 天（D0 + D+1..D+14）；缺失/超时 todayWeatherSource='missing'，按 14 天统计。
      const {
        forecastDays: forecastWithD0,
        todayWeatherSource,
        todayWeatherReason,
        referenceDate
      } = await injectD0IntoForecastDays({
        locationKey,
        timezone,
        referenceDate: request.body.referenceDate || '',
        forecastDays: forecastWeatherDays.slice(0, 14)
      })

      const historical = buildWeatherSummary(weatherDays.slice(0, 10), strategy)
      const forecast = buildWeatherSummary(forecastWithD0.slice(0, 15), strategy)

      const timeline = normalizeCareBehaviorTimeline({
        referenceDate,
        watering_events_10d: wateringEvents
      })

      // v3 蒸腾间隔修正：仅影响"我的植物"下次浇水间隔（BASELINE 间隔），
      // 不影响单次浇水毫升数（amountRangeMl 由 hydration-load 独立计算），
      // 也不绕过 WET/DRY Gate 保护。默认实际生效，环境变量可显式切回影子模式。
      // 结构化光照环境（光型、进入方式、补光灯）由职责单一的小模块读取。
      const transpirationShadow = resolveShadowModeFromEnv(process.env)
      const lightEnvironment = await getUserPlantLightEnvironment(openid, plantId)
      // 空气交换、局部气流和设备风先在证据层分开，再以 bounded interval factor 进入 BASELINE。
      const airEnvironmentEvidence = resolveAirEnvironmentEvidence(
        request.body.airEnvironmentOverride
      )
      const transpiration = computeTranspirationIntervalFactor({
        lightEnvironment: lightEnvironment || null,
        weatherDays: weatherDays.slice(0, 10),
        weatherSummary: historical,
        airEnvironmentEvidence,
        plantStrategy: strategy.wateringQuantization
          ? { wateringQuantization: strategy.wateringQuantization }
          : null,
        shadow: transpirationShadow
      })

      // shadow 模式：intervalFactor 恒为 1.0，业务采用 legacy 间隔；
      // 默认 intervalFactor 生效，影响 BASELINE 间隔。
      // potProfileOverride：独立浇水建议流程可从前端传入当前步骤盆型，优先于数据库 potProfile；
      // 首页浇水提醒不传此字段，回退到 strategy.potProfile（DB），保持兼容。
      const potProfileOverride = request.body.potProfile || null
      const plan = buildWateringPlanner({
        wateringStrategy: strategy.watering || {},
        historical,
        forecast,
        behaviorTimeline: timeline,
        potProfile: potProfileOverride || strategy.potProfile || null,
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
          potProfile: potProfileOverride || strategy.potProfile || null,
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
          soilCheck: plan.soilCheck,
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
          transpirationAirFactor: transpiration.airFactor,
          seasonalIntervalFactor: plan.seasonalIntervalFactor,
          transpirationCandidateNextWaterDate: candidateNextWaterDate,
          transpirationCandidateNextWaterWindow: candidateNextWaterWindow,
          airEnvironmentAudit: airEnvironmentEvidence
            ? {
                evidence: airEnvironmentEvidence,
                intervalFactor: transpiration.intervalFactor,
                airFactor: transpiration.airFactor,
                computedFactor: transpiration.computedFactor,
                shadow: transpiration.shadow
              }
            : null,
          // D0 当日天气来源审计：'day_latest_sample' | 'missing'
          todayWeatherSource,
          todayWeatherReason
        }
      })
    }

    if (method === 'GET') {
      const id = Number(request.query.id)
      if (id) {
        const plant = await getUserPlantInstanceById(openid, id)
        if (!plant) {
          return jsonResponse(404, { code: 404, message: '植物不存在或无权限', data: null })
        }
        const enriched = await attachCareLocationsToList({
          openid,
          data: { list: [plant], total: 1, page: 1, pageSize: 1 }
        })
        return jsonResponse(200, { code: 200, data: enriched.list[0] || plant })
      }
      const data = await listUserPlantInstances(openid, {
        page: Number(request.query.page || 1),
        pageSize: Number(request.query.pageSize || 20)
      })
      const enrichedData = await attachCareLocationsToList({ openid, data })
      const reminderData = await attachWateringReminderStateToList(openid, enrichedData)
      const fertilizationReminderData = await attachFertilizationReminderStateToList(
        openid,
        reminderData
      )
      return jsonResponse(200, { code: 200, data: fertilizationReminderData })
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
        // generic placement is legacy-only; new forms no longer collect it.
        location: request.body.location || null,
        plantDate: request.body.plantDate || null,
        notes: request.body.notes ?? null,
        lightEnvironment: Object.prototype.hasOwnProperty.call(
          request.body || {},
          'lightEnvironment'
        )
          ? normalizePersistedLightEnvironment(request.body.lightEnvironment)
          : null,
        airEnvironment: Object.prototype.hasOwnProperty.call(request.body || {}, 'airEnvironment')
          ? request.body.airEnvironment
          : null,
        airEnvironmentLocationBinding:
          request.body.airEnvironmentLocationBinding || request.body.locationBinding || null,
        potTopDiameterCm: request.body.potTopDiameterCm,
        potBottomDiameterCm: request.body.potBottomDiameterCm,
        potHeightCm: request.body.potHeightCm,
        hasDrainageHole: request.body.hasDrainageHole,
        potMaterial: request.body.potMaterial,
        substrateType: request.body.substrateType,
        potProfileSource: request.body.source,
        potProfileConfidence: request.body.confidence,
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
      const updates = { ...request.body }
      if (Object.prototype.hasOwnProperty.call(updates, 'lightEnvironment')) {
        updates.lightEnvironment = normalizePersistedLightEnvironment(updates.lightEnvironment)
      }
      const updated = await updateUserPlantInstance(openid, id, updates)
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
module.exports._test = {
  main,
  buildWateringReminderErrorDiagnostic,
  normalizePersistedLightEnvironment
}

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
