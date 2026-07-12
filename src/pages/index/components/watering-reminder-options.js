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
    return '点击补充盆型信息'
  }
  const parts = []
  if (profile.potTopDiameterCm) {
    parts.push(`口径 ${profile.potTopDiameterCm}cm`)
  }
  parts.push(profile.hasDrainageHole === 'true' ? '有排水孔' : '无/不确定排水孔')
  const composition = parseSubstrateComposition(profile)
  if (composition?.length) {
    parts.push(
      composition.map(item => SUBSTRATE_LABEL_MAP[item.material] || item.material).join('+')
    )
  }
  return parts.join(' · ')
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
  const rows = [
    {
      label: '建议水量',
      value: amountBottleText,
      valueClass: 'text-xs font-medium text-gray-700'
    }
  ]
  if (plannerResult?.stopCondition) {
    rows.push({
      label: '停止条件',
      value: plannerResult.stopCondition,
      valueClass: 'text-xs text-gray-600'
    })
  }
  if (plannerResult?.confidenceLevel) {
    rows.push({
      label: '置信度',
      value: { low: '低', normal: '中', high: '高' }[plannerResult.confidenceLevel] || '低',
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
  if (data.nextWaterDate && data.nextWaterDate < todayStr()) {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    return { ...data, nextWaterDate: todayStrFromDate(tomorrow) }
  }
  return data
}

export function normalizeSavedReminderPlannerResult(reminder) {
  return normalizePlannerResultDate(reminder?.plannerResult || reminder)
}

function todayStrFromDate(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-')
}

export function isWateringReminderActive(reminder) {
  if (!reminder?.nextTime) {
    return false
  }
  const nextTime = new Date(reminder.nextTime)
  return !Number.isNaN(nextTime.getTime()) && nextTime >= new Date()
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

export function buildWateringReminderInputSignature({ lastWatered = '', potProfile = null } = {}) {
  return JSON.stringify({
    lastWatered: String(lastWatered || '').trim(),
    potProfile: potProfile || null
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
  forecastDays
}) {
  return {
    plantId,
    wateringEvents,
    referenceDate: todayStr(),
    weatherDays,
    forecastDays
  }
}

export async function fetchWateringPlannerResult({
  plantId,
  wateringEvents,
  weatherDays,
  forecastDays
}) {
  const response = await requestHttpFunction('plant-user-http/user-plants/watering-planner', {
    method: 'POST',
    body: buildWateringPlannerRequestPayload({
      plantId,
      wateringEvents,
      weatherDays,
      forecastDays
    })
  })
  return response?.code === 200 ? normalizePlannerResultDate(response.data) : null
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
      '后续修改请到系统日历中操作。'
    ]
      .filter(Boolean)
      .join('\n'),
    allDay: false
  }
}

export function buildWateringReminderSavePayload({
  plantId,
  planId,
  lastWatered,
  nextWaterDate,
  wateringEvents,
  plannerResult,
  calendarPayload
}) {
  return {
    plantId,
    planId,
    lastWatered,
    nextWaterDate,
    nextWaterTime: '09:00:00',
    nextTime: buildReminderNextTime(nextWaterDate),
    wateringEvents,
    plannerResult: {
      ...plannerResult,
      planId
    },
    calendarPayload
  }
}

/* ---------- 独立浇水建议 API（不绑定用户植物，基于植物种类 + 临时盆型） ---------- */

export function buildAdhocPlannerRequestPayload({
  catalogPlantId,
  potProfile,
  weatherDays,
  forecastDays
}) {
  return {
    catalogPlantId,
    potProfile,
    referenceDate: todayStr(),
    weatherDays,
    forecastDays
  }
}

export async function fetchAdhocPlannerResult({
  catalogPlantId,
  potProfile,
  weatherDays,
  forecastDays
}) {
  const response = await requestHttpFunction('plant-user-http/user-plants/watering-advisor', {
    method: 'POST',
    body: buildAdhocPlannerRequestPayload({ catalogPlantId, potProfile, weatherDays, forecastDays })
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

export async function fetchAdvisorSessions({ page = 1, pageSize = 20 } = {}) {
  const response = await requestHttpFunction(
    `plant-user-http/user-plants/watering-advisor?page=${page}&pageSize=${pageSize}`,
    { method: 'GET' }
  )
  return response?.code === 200 ? response.data : null
}
