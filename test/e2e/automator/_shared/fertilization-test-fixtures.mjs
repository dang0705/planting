'use strict'

/* oxlint-disable no-magic-numbers -- These literals deliberately model an audited fixture plant. */

export const USER_STORE_KEY = 'user'
export const USER_PLANTS_QUERY_KEY = ['http-function', 'plant-user-http', 'user-plants']
export const FIXTURE_PLANT_ID = 95001
export const INDEX_PAGE = '/pages/index/index'
export const REMINDER_PAGE = '/pages/reminder/reminder'
export const DETAIL_PAGE = `/subpackages/plant/user-plant-detail/user-plant-detail?mode=view&id=${FIXTURE_PLANT_ID}`
export const DETAIL_ROUTE = 'subpackages/plant/user-plant-detail/user-plant-detail'

export const FIXTURE_USER = Object.freeze({
  userId: 'e2e_fertilization_monthly_fixture_user',
  openid: 'e2e_fertilization_monthly_fixture_openid',
  union_id: '',
  username: '施肥月度表验收用户',
  nickname: '施肥月度表验收用户',
  avatar: '',
  email: '',
  phoneNumber: '',
  location: { province: '', city: '', latitude: 0, longitude: 0 },
  membership: { type: 'free', expireTime: null, freeQuota: 5, usedCount: 0 },
  isLoggedIn: true,
  token: '',
  lastRefreshTime: 0
})

export const PAUSE_SCHEDULE = Object.freeze({ schemaVersion: 1, kind: 'pause' })
export const CONDITIONAL_SCHEDULE = Object.freeze({ schemaVersion: 1, kind: 'conditional' })
export const EVENT_SCHEDULE = Object.freeze({ schemaVersion: 1, kind: 'event' })
export const LIQUID_INTERVAL_SCHEDULE = Object.freeze({
  schemaVersion: 1,
  kind: 'interval',
  interval: { min: { value: 1, unit: 'month' }, max: { value: 1, unit: 'month' } }
})
export const SLOW_RELEASE_INTERVAL_SCHEDULE = Object.freeze({
  schemaVersion: 1,
  kind: 'interval',
  interval: { min: { value: 3, unit: 'month' }, max: { value: 3, unit: 'month' } }
})

const DEFAULT_SCOPE_GUIDANCE =
  '按实际生长节奏参考月份；停止生长时暂停。表中标为“暂停施肥”或“暂停追加”时，该月不安排这类肥料的提醒。'
const MONTHS_PER_YEAR = 12
const FIRST_MONTH = 1

export function currentMonthNumber(date = new Date()) {
  return date.getMonth() + FIRST_MONTH
}

export function createMonthlyCell(displayText, schedule, sourceNames = ['RHS']) {
  return { displayText, sourceNames, schedule }
}

export function createMonthlyRows({ currentMonth = currentMonthNumber(), currentCells = {} } = {}) {
  return Array.from({ length: MONTHS_PER_YEAR }, (_, index) => {
    const month = index + FIRST_MONTH
    if (month === currentMonth) {
      return {
        month,
        liquid:
          currentCells.liquid ||
          createMonthlyCell('每月1次', LIQUID_INTERVAL_SCHEDULE, ['RHS', 'UMN Extension']),
        slowRelease:
          currentCells.slowRelease ||
          createMonthlyCell('约3个月1次（长新叶或新芽时）', SLOW_RELEASE_INTERVAL_SCHEDULE)
      }
    }
    return {
      month,
      liquid: createMonthlyCell('暂停施肥', PAUSE_SCHEDULE),
      slowRelease: createMonthlyCell('暂停追加', PAUSE_SCHEDULE)
    }
  })
}

export function createFertilizationMonthly({ available = true, rows, scopeGuidance } = {}) {
  if (!available) {
    return { available: false, rows: [], scopeLabel: '', scopeGuidance: '', sourceNames: [] }
  }
  return {
    available: true,
    scopeLabel: '温带室内盆栽参考（龟背竹属）',
    scopeType: 'indoor',
    adjustmentMode: 'phenology',
    scopeGuidance: scopeGuidance || DEFAULT_SCOPE_GUIDANCE,
    choiceGuidance: '液体肥和缓释肥选一种，不要同时使用。',
    publicNote: '',
    rows: rows || createMonthlyRows(),
    sourceNames: ['RHS', 'UMN Extension']
  }
}

export function createFixturePlant({ fertilizationMonthly = createFertilizationMonthly() } = {}) {
  return {
    id: FIXTURE_PLANT_ID,
    plantId: 'genus_care_026e7432408d56ad',
    canonicalName: '龟背竹',
    displayName: '龟背竹',
    recognizedName: 'Monstera deliciosa',
    nickname: '施肥表验收龟背竹',
    genus: 'Monstera',
    familyCn: '天南星科',
    familyEn: 'Araceae',
    latinName: 'Monstera deliciosa',
    sourceType: 'catalog',
    identityResolutionStatus: 'matched',
    location: '室内',
    plantDate: '2026-05-01',
    createdAt: '2026-05-01T00:00:00.000Z',
    notes: '',
    photos: [],
    imageFileId: '',
    lastWatered: null,
    nextWater: null,
    watering: { way: '表层2–3cm微干后浇透', freq: [5, 10], unit: '天' },
    fertilization: {
      freq: [30, 45],
      type: '1/2浓度均衡肥',
      unit: '天',
      other: '生长期为主；休眠/低温/弱光期减量或暂停'
    },
    fertilizationMonthly,
    sunning: { way: '明亮散射光/半阴', freq: [3, 6], unit: '小时/天' },
    ventilation: { level: 'medium', sensitivity: 'medium' },
    temperatureMin: 18,
    temperatureMax: 30,
    humidityMin: 50,
    humidityMax: 80,
    potProfile: {
      potTopDiameterCm: 18,
      potBottomDiameterCm: 15,
      potHeightCm: 16,
      hasDrainageHole: 'true',
      potMaterial: 'plastic',
      substrateType: 'general'
    }
  }
}

export function createActiveReminder({
  planId = 'fixture-active-plan-95001',
  fertilizerType = 'liquid',
  reminderKind = 'normal',
  isDue = false,
  canComplete = true,
  requiresMinimumIntervalAcknowledgement = false,
  conditionRequirements = []
} = {}) {
  return {
    planId,
    plantId: FIXTURE_PLANT_ID,
    active: true,
    isDue,
    fertilizerType,
    reminderKind,
    canComplete,
    requiresMinimumIntervalAcknowledgement,
    conditionRequirements,
    nextCheckDate: '2026-08-22',
    nextTime: '2026-08-22T09:00:00',
    ruleSnapshot: {
      displayText: fertilizerType === 'slowRelease' ? '约3个月1次（长新叶或新芽时）' : '每月1次',
      sourceNames: ['RHS', 'UMN Extension'],
      schedule:
        fertilizerType === 'slowRelease' ? SLOW_RELEASE_INTERVAL_SCHEDULE : LIQUID_INTERVAL_SCHEDULE
    }
  }
}
