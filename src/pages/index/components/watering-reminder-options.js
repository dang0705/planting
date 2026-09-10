import { requestHttpFunction } from '@/api/http'
import { formatMlToBottleText } from '@/utils/water-volume-format.js'

export const SUBSTRATE_LABEL_MAP = {
  general: '田园土',
  coco: '椰糠',
  ceramsite: '陶粒',
  peat: '泥炭土',
  perlite: '珍珠岩',
  bark: '树皮',
  sphagnum: '水苔',
  gritty: '颗粒土',
  coarse_sand: '粗砂'
}

export const REASON_CODE_LABEL_MAP = {
  OVERWATERING_RISK_WARNING: '可能浇多了',
  CHECK_SOIL_BEFORE_WATERING: '先检查土壤',
  INCREASE_WATERING_FREQUENCY: '该浇水了',
  RECENT_THOROUGH_WATERING: '最近刚浇透',
  STRONG_WET_ENVIRONMENT: '最近天气很湿',
  HOT_DRY_FORECAST: '接下来又热又干',
  NO_RECENT_WATERING: '有一阵没浇了',
  BASELINE_INTERVAL: '按正常节奏来',
  MIST_DOES_NOT_OFFSET_DRY: '喷一下不够，要浇透',
  NO_DRAINAGE_NARROW_BOTTOM: '盆没孔要少浇',
  DRY_SUPPRESSED_BY_WET_ENVIRONMENT: '天气湿，先别急着浇',
  AMOUNT_ML_CONFLICTS_WITH_AMOUNT_LABEL: '上次浇水量记录有出入',
  WET_ENVIRONMENT_AMOUNT_REDUCED: '天气湿，少浇点',
  USER_DOSE_ANCHORED: '参考了你平时的浇水量'
}

export function reasonCodeLabel(code) {
  return REASON_CODE_LABEL_MAP[code] || ''
}

export function todayStr() {
  const date = new Date()
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-')
}

export function parseSubstrateComposition(profile) {
  if (profile?.substrateComposition) {
    return profile.substrateComposition
  }
  if (typeof profile?.substrateType !== 'string' || !profile.substrateType.startsWith('[')) {
    return null
  }
  try {
    return JSON.parse(profile.substrateType)
  } catch {
    return null
  }
}

export function buildPotProfileSummary(profile) {
  if (!profile) {
    return '填写盆口和盆高，可估算水量范围'
  }
  const parts = []
  if (profile.potTopDiameterCm) {
    parts.push(`口径 ${profile.potTopDiameterCm}cm`)
  }
  if (profile.potHeightCm) {
    parts.push(`高 ${profile.potHeightCm}cm`)
  }
  if (!profile.potTopDiameterCm || !profile.potHeightCm) {
    return '填写盆口和盆高，可估算水量范围'
  }
  if (!profile.potBottomDiameterCm) {
    return '已有基础尺寸，还可以补充盆底尺寸'
  }
  if (profile.potBottomDiameterCm) {
    parts.push(`底径 ${profile.potBottomDiameterCm}cm`)
  }
  if (profile.hasDrainageHole === 'true') {
    parts.push('有排水孔')
  } else if (profile.hasDrainageHole === 'false') {
    parts.push('无排水孔')
  } else {
    parts.push('排水孔不确定')
  }
  const composition = parseSubstrateComposition(profile)
  if (composition?.length) {
    parts.push(
      composition.map(item => SUBSTRATE_LABEL_MAP[item.material] || item.material).join('+')
    )
  }
  return parts.join(' · ')
}

export function resolvePotProfileState(profile) {
  if (!profile || Number(profile.potTopDiameterCm) <= 0 || Number(profile.potHeightCm) <= 0) {
    return 'missing'
  }
  if (Number(profile.potBottomDiameterCm) <= 0) {
    return 'partial'
  }
  return 'complete'
}

export function buildPlannerEvidenceText({
  plannerResult,
  potProfile,
  wateringEvents = [],
  hasWeatherRef = false
} = {}) {
  const profileState = resolvePotProfileState(potProfile)
  const evidence = []
  if (wateringEvents.length || plannerResult?.lastWateredDaysAgo !== undefined) {
    evidence.push('最近浇水记录')
  }
  if (hasWeatherRef || plannerResult?.weatherRef || plannerResult?.weatherUsed) {
    evidence.push('最近天气')
  }
  if (profileState !== 'missing') {
    evidence.push('盆型')
  }
  if (!evidence.length) {
    return '建议结合盆土确认'
  }
  return `已结合${evidence.join('、')}`
}

export function resolveWateringDoseText(echo, potVolumeMl) {
  if (!echo) {
    return ''
  }
  const doseClass = typeof echo === 'string' ? echo : echo?.doseClass
  const amountMl = typeof echo === 'object' ? Number(echo?.amountMl) : null
  const ratios = { mist: 0.03, small: 0.1, normal: 0.25, thorough: 0.5 }
  if (doseClass === 'thorough') {
    return '浇到出水'
  }
  if (doseClass && ratios[doseClass] && potVolumeMl > 0) {
    return formatMlToBottleText(
      amountMl > 0 ? amountMl : Math.round(potVolumeMl * ratios[doseClass])
    )
  }
  return ''
}

export function buildPlannerSummaryRows({
  plannerResult,
  amountBottleText,
  isOverWateringBlocked,
  potVolumeMl
}) {
  if (!amountBottleText || isOverWateringBlocked) {
    return []
  }
  const rows = []
  if (plannerResult?.stopCondition) {
    rows.push({
      label: '停止条件',
      value: plannerResult.stopCondition,
      valueClass: 'text-xs text-gray-600'
    })
  }
  const doseText = resolveWateringDoseText(plannerResult?.userDoseEcho, potVolumeMl)
  if (doseText) {
    rows.push({ label: '你通常浇', value: doseText, valueClass: 'text-xs text-gray-500' })
  }
  return rows
}

export function normalizePlannerResultDate(data = {}) {
  return data
}

export function normalizeSavedReminderPlannerResult(reminder) {
  return normalizePlannerResultDate(reminder?.plannerResult || reminder)
}

export function isWateringReminderActive(reminder) {
  if (!reminder?.nextTime) {
    return false
  }
  if (reminder.status && reminder.status !== 'active') {
    return false
  }
  const nextTime = new Date(reminder.nextTime)
  return !Number.isNaN(nextTime.getTime())
}

export function formatReminderDateTimeText(value) {
  if (!value) {
    return ''
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return String(value).slice(0, 16).replace('T', ' ')
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes()
  ).padStart(2, '0')}`
}

export function formatReminderTimeText(value) {
  const text = String(value || '')
  const match = text.match(/[T\s](\d{2}:\d{2})/)
  return match ? match[1] : '09:00'
}

export function buildSavedReminderDisplay(reminder) {
  if (!reminder) {
    return { createdText: '', nextText: '', reasonText: '' }
  }
  const nextText = reminder.nextWaterDate
    ? `建议下次浇水：${reminder.nextWaterDate} ${formatReminderTimeText(reminder.nextTime)}`
    : ''
  return {
    createdText: formatReminderDateTimeText(reminder.createdAt),
    nextText,
    reasonText: reminder.nextWaterReason || ''
  }
}

export function resolveLastWateringDate(events = [], fallback = '') {
  return (
    events
      .map(event => String(event?.date || '').trim())
      .filter(Boolean)
      .sort((a, b) => b.localeCompare(a))[0] || String(fallback || '').trim()
  )
}

export function buildWateringReminderInputSignature({
  lastWatered = '',
  potProfile = null,
  wateringEvents = []
} = {}) {
  const wateringEventSignature = (Array.isArray(wateringEvents) ? wateringEvents : [])
    .map(event => ({
      date: String(event?.date || '').trim(),
      amountMl: event?.amountMl ?? event?.amount_ml ?? null,
      amount: String(event?.amount || '').trim()
    }))
    .filter(event => event.date)
    .sort((a, b) =>
      `${a.date}-${a.amountMl}-${a.amount}`.localeCompare(`${b.date}-${b.amountMl}-${b.amount}`)
    )
  return JSON.stringify({
    lastWatered: String(lastWatered || '').trim(),
    potProfile: potProfile || null,
    wateringEvents: wateringEventSignature
  })
}

export function buildReminderNextTime(nextWaterDate) {
  return `${nextWaterDate}T09:00:00`
}

export function resolveWeatherLocation(location = {}) {
  const lat = Number(location.latitude ?? location.lat)
  const lng = Number(location.longitude ?? location.lng)
  return Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0
    ? {
        lat,
        lng,
        city: String(location.city || '').trim(),
        province: String(location.province || '').trim()
      }
    : null
}

export function addPhoneCalendar(calendarPayload) {
  if (typeof uni.addPhoneCalendar !== 'function') {
    return Promise.reject(new Error('当前微信版本暂不支持添加系统日历'))
  }
  return new Promise((resolve, reject) => {
    uni.addPhoneCalendar({
      ...calendarPayload,
      success: resolve,
      fail: reject
    })
  })
}

export function resolvePlantDisplayName(plant) {
  return plant?.displayName || plant?.canonicalName || '当前植物'
}

export function buildWateringPlannerRequestPayload({
  plantId,
  wateringEvents,
  weatherDays,
  forecastDays,
  potProfile = null,
  locationKey = '',
  timezone = 'Asia/Shanghai',
  airEnvironmentOverride = null
}) {
  const payload = {
    plantId,
    wateringEvents,
    referenceDate: todayStr(),
    weatherDays,
    forecastDays,
    locationKey: String(locationKey || '').trim(),
    timezone: String(timezone || 'Asia/Shanghai').trim() || 'Asia/Shanghai'
  }
  // 独立浇水建议流程可传入当前步骤中的盆型（默认值或用户修改值），
  // 后端优先使用此覆盖值；首页浇水提醒不传此字段，后端回退到数据库 potProfile。
  if (potProfile) {
    payload.potProfile = potProfile
  }
  if (airEnvironmentOverride) {
    payload.airEnvironmentOverride = airEnvironmentOverride
  }
  return payload
}

export async function fetchWateringPlannerResult({
  plantId,
  wateringEvents,
  weatherDays,
  forecastDays,
  potProfile = null,
  locationKey = '',
  timezone = 'Asia/Shanghai',
  airEnvironmentOverride = null
}) {
  const response = await requestHttpFunction('plant-user-http/user-plants/watering-planner', {
    method: 'POST',
    returnErrorResponse: true,
    body: buildWateringPlannerRequestPayload({
      plantId,
      wateringEvents,
      weatherDays,
      forecastDays,
      potProfile,
      locationKey,
      timezone,
      airEnvironmentOverride
    })
  })
  if (response?.code !== 200) {
    const error = new Error(response?.message || '暂时无法生成浇水建议，请稍后重试。')
    error.statusCode = response?.code || 500
    error.requiresWateringHistory = Boolean(response?.data?.requiresWateringHistory)
    throw error
  }
  return normalizePlannerResultDate(response.data)
}

export function buildWateringReminderCalendarPayload({
  plant,
  nextWaterDate,
  amountText,
  reasonText
}) {
  return buildPhoneCalendarPayload({
    plantName: resolvePlantDisplayName(plant),
    nextWaterDate,
    amountText,
    reasonText
  })
}

export function attachPlanIdToWateringEvents(events = [], planId) {
  return events.map(event => ({ ...event, planId }))
}

export function buildPhoneCalendarPayload({
  plantName,
  nextWaterDate,
  amountText = '',
  reasonText = ''
}) {
  const startDate = new Date(buildReminderNextTime(nextWaterDate))
  const endDate = new Date(startDate.getTime() + 30 * 60 * 1000)
  return {
    title: `${plantName}浇水提醒`,
    startTime: Math.floor(startDate.getTime() / 1000),
    endTime: Math.floor(endDate.getTime() / 1000),
    description: [
      reasonText,
      amountText ? `建议水量：${amountText}` : '',
      '此提醒已保存到手机日历；在日历中修改不会同步回青花植。'
    ]
      .filter(Boolean)
      .join('\n'),
    allDay: false
  }
}

export function buildWateringReminderSavePayload({
  plantId,
  planId,
  wateringEvents,
  plannerResult,
  calendarPayload,
  weatherDays = [],
  forecastDays = [],
  locationKey = '',
  timezone = 'Asia/Shanghai',
  airEnvironmentOverride = null
}) {
  return {
    plantId,
    planId,
    wateringEvents,
    calendarPayload,
    weatherDays,
    forecastDays,
    locationKey,
    timezone,
    airEnvironmentOverride,
    // 仅作为客户端日历展示的本地快照，不作为服务端业务结果来源。
    clientPlanId: String(plannerResult?.planId || planId || '')
  }
}

/* ---------- 独立浇水建议 API（不绑定用户植物，基于植物种类 + 临时盆型） ---------- */

export function buildAdhocPlannerRequestPayload({
  catalogPlantId,
  potProfile,
  weatherDays,
  forecastDays,
  locationKey = '',
  timezone = 'Asia/Shanghai'
}) {
  return {
    catalogPlantId,
    potProfile,
    referenceDate: todayStr(),
    weatherDays,
    forecastDays,
    locationKey: String(locationKey || '').trim(),
    timezone: String(timezone || 'Asia/Shanghai').trim() || 'Asia/Shanghai'
  }
}

export async function fetchAdhocPlannerResult({
  catalogPlantId,
  potProfile,
  weatherDays,
  forecastDays,
  locationKey = '',
  timezone = 'Asia/Shanghai'
}) {
  const response = await requestHttpFunction('plant-user-http/user-plants/watering-advisor', {
    method: 'POST',
    body: buildAdhocPlannerRequestPayload({
      catalogPlantId,
      potProfile,
      weatherDays,
      forecastDays,
      locationKey,
      timezone
    })
  })
  return response?.code === 200 ? normalizePlannerResultDate(response.data) : null
}

export async function saveAdvisorSession({
  catalogPlantId,
  catalogPlantName,
  potProfile,
  weatherSummary,
  plannerResult
}) {
  const response = await requestHttpFunction('plant-user-http/user-plants/watering-advisor', {
    method: 'POST',
    body: {
      action: 'save',
      catalogPlantId,
      catalogPlantName,
      potProfile,
      weatherSummary,
      plannerResult
    }
  })
  return response?.code === 200 ? response.data : null
}

export async function confirmAdvisorSessionWatered({ catalogPlantId, wateredDate }) {
  const response = await requestHttpFunction('plant-user-http/user-plants/watering-advisor', {
    method: 'POST',
    body: {
      action: 'confirm_watered',
      catalogPlantId,
      wateredDate
    }
  })
  if (response?.code !== 200) {
    throw new Error(response?.message || '记录失败，请稍后重试')
  }
  return response.data
}

export async function fetchAdvisorSessions({ page = 1, pageSize = 20 } = {}) {
  const response = await requestHttpFunction('plant-user-http/user-plants/watering-advisor', {
    method: 'GET',
    query: { page, pageSize }
  })
  return response?.code === 200 ? response.data : null
}
