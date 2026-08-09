import { hasMeaningfulLightEnvironment } from './light-environment.js'
import { isAirEnvironmentAnswerReady } from './air-environment.js'
import { normalizePlantCareLocation } from './plant-care-location.js'

// 完整度只奖励当前算法真正会使用的资料；总分保持 100。
const WEIGHTS = Object.freeze({
  identity: 10,
  careCity: 45,
  plantDate: 5,
  lightEnvironment: 10,
  airEnvironment: 15,
  potProfile: 15
})

function normalizeText(value = '') {
  return String(value || '').trim()
}

function resolveIdentityName(plant = {}) {
  return normalizeText(
    plant?.displayName ||
      plant?.canonicalName ||
      plant?.recognizedName ||
      plant?.name ||
      plant?.plantName ||
      plant?.identity?.name ||
      plant?.plant?.name
  )
}

function resolvePlantDate(plant = {}) {
  // createdAt 是记录创建时间，不代表用户实际入手或种植时间。
  return normalizeText(plant?.plantDate || plant?.plantingDate || plant?.acquiredAt)
}

function hasMeaningfulAirEnvironment(value) {
  const input = value?.input || value
  return Boolean(input && isAirEnvironmentAnswerReady(input))
}

function hasMeaningfulPotProfile(profile) {
  if (!profile || typeof profile !== 'object') {
    return false
  }
  const top = Number(profile.potTopDiameterCm)
  const height = Number(profile.potHeightCm)
  const substrate = normalizeText(profile.substrateType)
  const hasDrainage = ['true', 'false'].includes(normalizeText(profile.hasDrainageHole))
  return top > 0 && height > 0 && Boolean(substrate) && substrate !== 'unknown' && hasDrainage
}

export function getPlantProfileCompletenessDetail(plant = {}) {
  const identityName = resolveIdentityName(plant)
  const careLocation = normalizePlantCareLocation(plant?.careLocation)
  const plantDate = resolvePlantDate(plant)
  const hasLight = hasMeaningfulLightEnvironment(plant?.lightEnvironment)
  const hasAir = hasMeaningfulAirEnvironment(plant?.airEnvironment)
  const hasPotProfile = hasMeaningfulPotProfile(plant?.potProfile)

  const items = {
    identity: {
      earned: identityName ? WEIGHTS.identity : 0,
      max: WEIGHTS.identity,
      satisfied: Boolean(identityName),
      label: '植物身份'
    },
    careCity: {
      earned: careLocation ? WEIGHTS.careCity : 0,
      max: WEIGHTS.careCity,
      satisfied: Boolean(careLocation),
      required: true,
      label: '养护城市'
    },
    plantDate: {
      earned: plantDate ? WEIGHTS.plantDate : 0,
      max: WEIGHTS.plantDate,
      satisfied: Boolean(plantDate),
      label: '入手或种植时间'
    },
    lightEnvironment: {
      earned: hasLight ? WEIGHTS.lightEnvironment : 0,
      max: WEIGHTS.lightEnvironment,
      satisfied: hasLight,
      optional: true,
      label: '光照环境'
    },
    airEnvironment: {
      earned: hasAir ? WEIGHTS.airEnvironment : 0,
      max: WEIGHTS.airEnvironment,
      satisfied: hasAir,
      optional: true,
      label: '空气环境'
    },
    potProfile: {
      earned: hasPotProfile ? WEIGHTS.potProfile : 0,
      max: WEIGHTS.potProfile,
      satisfied: hasPotProfile,
      optional: true,
      label: '花盆与盆土'
    }
  }

  const rawScore = Object.values(items).reduce((sum, item) => sum + item.earned, 0)
  const score = Math.max(0, Math.min(100, Math.round(rawScore)))

  return {
    score,
    items,
    requiredMissing: !items.careCity.satisfied,
    missingItems: Object.entries(items)
      .filter(([, item]) => !item.satisfied)
      .map(([key, item]) => ({
        key,
        label: item.label,
        required: Boolean(item.required),
        optional: Boolean(item.optional)
      }))
  }
}

export function calcPlantProfileCompleteness(plant = {}) {
  return getPlantProfileCompletenessDetail(plant).score
}
