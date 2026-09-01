'use strict'

// The CloudBase Node 18.15 runtime does not expose the Web File global, while
// some transitive SDK releases load undici during startup and expect it.
if (typeof globalThis.File !== 'function') {
  globalThis.File = class File {}
}

const {
  jsonResponse,
  internalServerError,
  notFound,
  methodNotAllowed,
  getHttpRequestData,
  resolveRequestAppEnv,
  runWithRequestAppEnv,
  resolveHttpUserInfo
} = require('/opt/utils/http')
let platformSession
try {
  platformSession = require('/opt/utils/platform-session')
} catch {
  platformSession = require('../layer/utils/platform-session')
}
const { allowedManualPlantFields, assertPlatformFeature, isRestrictedPlatform } = platformSession
let cloudbaseUtils
let catalogImageUrlUtils
try {
  cloudbaseUtils = require('/opt/utils/cloudbase')
  catalogImageUrlUtils = require('/opt/utils/catalog-image-url')
} catch {
  cloudbaseUtils = require('../layer/utils/cloudbase')
  catalogImageUrlUtils = require('../layer/utils/catalog-image-url')
}
const { getCloudBase } = cloudbaseUtils
const { resolveCatalogImageUrls } = catalogImageUrlUtils
const {
  createUserPlantInstance,
  getUserPlantInstanceById,
  listUserPlantInstances,
  updateUserPlantInstance,
  getUserPlantWateringStrategy
} = require('/opt/utils/plant-knowledge')
const {
  buildWateringPlanner,
  normalizeCareBehaviorTimeline
} = require('/opt/utils/watering-planner')
const {
  attachCareLocation,
  attachCareLocationsToList,
  mapCareLocationRow,
  savePlantCareLocation
} = require('./care-location-service')
const { deleteUserPlantCompletely } = require('./plant-deletion-service')
const {
  completeWateringReminder,
  mapReminderRow: mapWateringReminderRow,
  readWateringReminder,
  saveWateringReminder,
  undoWateringReminder
} = require('./watering-reminder-service')
const {
  cancelFertilizationReminder,
  completeFertilizationReminder,
  confirmFertilizationReminder,
  dismissFertilizationReminder,
  mapReminderRow: mapFertilizationReminderRow,
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

function resolveTodayDate() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

// 与前端 Vue Query 的 5 分钟新鲜期一致；所有写请求会主动失效，避免用户自己的修改读到旧列表。
const USER_PLANT_RESPONSE_CACHE_TTL_MS = 5 * 60 * 1_000
const userPlantListResponseCache = new Map()
const userPlantDetailResponseCache = new Map()

function readUserPlantResponseCache(cache, key) {
  const entry = cache.get(key)
  if (!entry || entry.expiresAt <= Date.now()) {
    cache.delete(key)
    return null
  }
  return entry.value
}

function writeUserPlantResponseCache(cache, key, value) {
  cache.set(key, { value, expiresAt: Date.now() + USER_PLANT_RESPONSE_CACHE_TTL_MS })
  return value
}

function invalidateUserPlantResponseCache(openid, plantId = null) {
  const listPrefix = `${openid}:`
  for (const key of userPlantListResponseCache.keys()) {
    if (key.startsWith(listPrefix)) {
      userPlantListResponseCache.delete(key)
    }
  }
  if (plantId) {
    userPlantDetailResponseCache.delete(`${openid}:${Number(plantId)}`)
  } else {
    for (const key of userPlantDetailResponseCache.keys()) {
      if (key.startsWith(listPrefix)) {
        userPlantDetailResponseCache.delete(key)
      }
    }
  }
}

const USER_PLANT_LIST_FIELDS = new Set([
  'id',
  'recordVersion',
  'plantId',
  'plantIdentityId',
  'sessionPlantId',
  'canonicalName',
  'nickname',
  'displayName',
  'recognizedName',
  'sourceType',
  'recognitionType',
  'recognitionConfidence',
  'identityResolutionStatus',
  'visualCallBatchId',
  'location',
  'plantDate',
  'notes',
  'photos',
  'lightEnvironment',
  'airEnvironment',
  'imageFileId',
  'lastWatered',
  'nextWater',
  'createdAt',
  'genus',
  'familyCn',
  'familyEn',
  'latinName',
  'healthStatus',
  'healthScore',
  'potProfile',
  'careLocationId',
  'careLocation',
  'locationKey',
  'wateringReminder',
  'fertilizationReminder',
  'fertilizationMonthly'
])

function compactUserPlantListItem(item = {}) {
  return Object.fromEntries(
    Object.entries(item).filter(([key, value]) => {
      if (!USER_PLANT_LIST_FIELDS.has(key)) {
        return false
      }
      if (value === null || value === undefined || value === '') {
        return false
      }
      if (Array.isArray(value) && value.length === 0) {
        return false
      }
      if (
        key === 'fertilizationMonthly' &&
        (!value ||
          value.available !== true ||
          !Array.isArray(value.rows) ||
          value.rows.length !== 12)
      ) {
        return false
      }
      return true
    })
  )
}

function compactRestrictedPlatformPlant(item = {}, { imageUrl = '' } = {}) {
  const payload = {
    id: item.id,
    recordVersion: Number(item.recordVersion || 1),
    nickname: item.nickname || '',
    recognizedName: item.recognizedName || '',
    displayName: item.nickname || item.recognizedName || '未命名植物',
    location: item.location || '',
    plantDate: item.plantDate || null,
    notes: item.notes || '',
    sourceType: 'manual',
    createdAt: item.createdAt || null
  }
  if (imageUrl) {
    payload.imageUrl = imageUrl
    payload.imageSource = 'catalog'
  }
  return payload
}

async function buildRestrictedPlatformPlant(item) {
  if (!item?.imageFileId) {
    return compactRestrictedPlatformPlant(item)
  }
  const imageUrls = await resolveCatalogImageUrls([item], { app: getCloudBase() })
  return compactRestrictedPlatformPlant(item, {
    imageUrl: imageUrls.get(String(item?.imageFileId || '').trim()) || ''
  })
}

async function buildRestrictedPlatformPlantList(items = []) {
  const safeItems = Array.isArray(items) ? items : []
  const imageUrls = safeItems.some(item => item?.imageFileId)
    ? await resolveCatalogImageUrls(safeItems, { app: getCloudBase() })
    : new Map()
  return safeItems.map(item =>
    compactRestrictedPlatformPlant(item, {
      imageUrl: imageUrls.get(String(item?.imageFileId || '').trim()) || ''
    })
  )
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
    try {
      assertPlatformFeature(userInfo, path)
    } catch (error) {
      if (Number(error?.statusCode) === 403) {
        return jsonResponse(403, {
          code: error.code || 'PLATFORM_FEATURE_UNAVAILABLE',
          message: error.message,
          data: null
        })
      }
      throw error
    }
    const openid = userInfo.openid
    const ownerUserId = userInfo.userId || openid
    const restrictedPlatform = isRestrictedPlatform(userInfo.platform)

    if (method !== 'GET') {
      invalidateUserPlantResponseCache(openid)
    }

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
        if (path.endsWith('/watering-reminders/undo')) {
          const result = await undoWateringReminder(openid, request.body)
          return jsonResponse(result.statusCode, {
            code: result.statusCode,
            message: result.message,
            data: result.data
          })
        }
        if (path.endsWith('/watering-reminders/complete')) {
          const result = await completeWateringReminder(openid, request.body)
          return jsonResponse(result.statusCode, {
            code: result.statusCode,
            message: result.message,
            data: result.data
          })
        }
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
          const statusCode = Number(error?.statusCode) || 500
          return jsonResponse(statusCode, {
            code: statusCode,
            message:
              statusCode === 409
                ? error?.message || '当前没有可添加的浇水日期'
                : '浇水提醒表未就绪或保存失败，请稍后重试',
            data: null
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

      // D0 校验：前端传完整 D0..D+14，后端先丢弃调用方 D0，再从 day file latestSample
      // 注入唯一权威 D0。命中时 forecast 为 15 天；缺失/超时仅保留 D+1..D+14。
      const {
        forecastDays: forecastWithD0,
        todayWeatherSource,
        todayWeatherReason,
        referenceDate
      } = await injectD0IntoForecastDays({
        locationKey,
        timezone,
        referenceDate: request.body.referenceDate || '',
        forecastDays: forecastWeatherDays.slice(0, 15)
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
      // 我的植物规划只使用服务端已保存的盆型；独立浇水建议走 /watering-advisor，
      // 避免客户端用临时盆型覆盖已保存资料并把结果误当成植物档案建议。
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
        const cacheKey = `${openid}:${id}`
        const cached = readUserPlantResponseCache(userPlantDetailResponseCache, cacheKey)
        if (cached) {
          return jsonResponse(200, { code: 200, data: cached })
        }
        const plant = await getUserPlantInstanceById(openid, id)
        if (!plant) {
          return jsonResponse(404, { code: 404, message: '植物不存在或无权限', data: null })
        }
        // 详情主查询已并行读取当前用户的位置；仅对旧数据/旧函数层缺失的位置再补查。
        const enriched = plant?.careLocation
          ? { list: [plant], total: 1, page: 1, pageSize: 1 }
          : await attachCareLocationsToList({
              openid,
              data: { list: [plant], total: 1, page: 1, pageSize: 1 }
            })
        const detail = enriched.list[0] || plant
        writeUserPlantResponseCache(userPlantDetailResponseCache, cacheKey, detail)
        return jsonResponse(200, {
          code: 200,
          data: restrictedPlatform ? await buildRestrictedPlatformPlant(detail) : detail
        })
      }
      const page = Number(request.query.page || 1)
      const pageSize = Number(request.query.pageSize || 20)
      const cacheKey = `${openid}:${page}:${pageSize}`
      const cached = readUserPlantResponseCache(userPlantListResponseCache, cacheKey)
      if (cached) {
        return jsonResponse(200, { code: 200, data: cached })
      }
      const data = await listUserPlantInstances(openid, {
        page,
        pageSize,
        includeEnrichments: true
      })
      const today = resolveTodayDate()
      const finalList = (data.list || []).map(item => {
        const enrichment = item.__listEnrichment || {}
        const { __listEnrichment: _ignored, ...plant } = item
        const careLocation = mapCareLocationRow(enrichment.careLocationRow)
        const withCareLocation = attachCareLocation(plant, careLocation)
        return compactUserPlantListItem({
          ...withCareLocation,
          wateringReminder: enrichment.wateringReminderRow
            ? mapWateringReminderRow(enrichment.wateringReminderRow)
            : null,
          fertilizationReminder: enrichment.fertilizationReminderRow
            ? mapFertilizationReminderRow(enrichment.fertilizationReminderRow, today)
            : null
        })
      })
      const finalData = {
        ...data,
        list: restrictedPlatform ? await buildRestrictedPlatformPlantList(finalList) : finalList
      }
      writeUserPlantResponseCache(userPlantListResponseCache, cacheKey, finalData)
      return jsonResponse(200, { code: 200, data: finalData })
    }

    if (method === 'POST') {
      const manual = restrictedPlatform ? allowedManualPlantFields(request.body) : null
      const created = await createUserPlantInstance({
        openid,
        ownerUserId,
        plantId: manual ? null : request.body.plantId || null,
        plantIdentityId: manual ? null : request.body.plantIdentityId || null,
        sessionPlantId: manual ? null : request.body.sessionPlantId || null,
        recognizedName: manual ? manual.recognizedName : request.body.recognizedName || null,
        sourceType: manual ? 'manual' : request.body.sourceType || 'catalog',
        recognitionType: request.body.recognitionType || null,
        recognitionConfidence: request.body.recognitionConfidence || null,
        identityResolutionStatus: request.body.identityResolutionStatus || null,
        visualCallBatchId: request.body.visualCallBatchId || null,
        nickname: manual ? manual.nickname : request.body.nickname || request.body.nickName || null,
        // generic placement is legacy-only; new forms no longer collect it.
        location: manual ? manual.location : request.body.location || null,
        plantDate: manual ? manual.plantDate : request.body.plantDate || null,
        notes: manual ? manual.notes : (request.body.notes ?? null),
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
        photos: manual ? null : request.body.photos || null
      })
      if (restrictedPlatform) {
        return jsonResponse(200, {
          code: 200,
          message: '保存成功',
          data: await buildRestrictedPlatformPlant(created)
        })
      }
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
      const updates = restrictedPlatform
        ? allowedManualPlantFields(request.body)
        : { ...request.body }
      if (Object.prototype.hasOwnProperty.call(updates, 'lightEnvironment')) {
        updates.lightEnvironment = normalizePersistedLightEnvironment(updates.lightEnvironment)
      }
      const updated = await updateUserPlantInstance(openid, id, updates)
      if (restrictedPlatform) {
        invalidateUserPlantResponseCache(openid, id)
        return jsonResponse(200, {
          code: 200,
          message: '更新成功',
          data: await buildRestrictedPlatformPlant(updated)
        })
      }
      const careLocation = await savePlantCareLocation({
        openid,
        plantId: id,
        careLocation: request.body.careLocation || request.body.plantCareLocation || null
      })
      invalidateUserPlantResponseCache(openid, id)
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
      if (restrictedPlatform) {
        const requestedRecordVersion = Number(
          request.body.recordVersion || request.query.recordVersion
        )
        if (!Number.isInteger(requestedRecordVersion) || requestedRecordVersion < 1) {
          return jsonResponse(400, {
            code: 'USER_PLANT_VERSION_INVALID',
            message: '植物版本无效，请刷新后再试',
            data: null
          })
        }
        const currentPlant = await getUserPlantInstanceById(openid, id)
        if (!currentPlant || Number(currentPlant.recordVersion || 1) !== requestedRecordVersion) {
          return jsonResponse(409, {
            code: 'USER_PLANT_VERSION_CONFLICT',
            message: '植物信息已在其他设备更新，请刷新后再试',
            data: null
          })
        }
      }
      let deleted
      try {
        deleted = await deleteUserPlantCompletely({ openid, plantId: id })
      } catch (error) {
        if (
          Number(error?.statusCode) === 400 ||
          Number(error?.statusCode) === 404 ||
          Number(error?.statusCode) === 409
        ) {
          return jsonResponse(error.statusCode, {
            code: error.statusCode,
            message: error.message,
            data: null
          })
        }
        if (Number(error?.statusCode) === 503) {
          return jsonResponse(503, {
            code: 503,
            message: '删除服务暂未就绪，请稍后重试',
            data: null
          })
        }
        throw error
      }
      return jsonResponse(200, {
        code: 200,
        message: deleted.cleanupPending ? '植物已删除，图片正在清理' : '删除成功',
        data: {
          id,
          cleanupPending: deleted.cleanupPending,
          cleanupAttempted: deleted.cleanupAttempted
        }
      })
    }

    return methodNotAllowed(method)
  } catch (error) {
    console.error('plant-user-http error:', error)
    if (Number(error?.statusCode) === 400 || Number(error?.statusCode) === 409) {
      return jsonResponse(error.statusCode, {
        code: error.code || error.statusCode,
        message: error.message || '植物信息暂时不可用，请稍后重试',
        data: null
      })
    }
    return internalServerError('植物信息暂时不可用，请稍后重试')
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
