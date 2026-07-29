import { hasMeaningfulLightEnvironment } from './light-environment.js'
import { normalizePlantCareLocation } from './plant-care-location.js'

// 完整度权重：养护类资料共 90%，基础身份资料保留 10%。
const WEIGHTS = Object.freeze({
  identity: 10,
  careCity: 60,
  placementLocation: 15,
  plantDate: 10,
  lightEnvironment: 5
})

function normalizeText(value = '') {
  return String(value || '').trim()
}

// 身份/显示名：植物种类已选或自定义名称已填
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

function resolvePlacementLocation(plant = {}) {
  return normalizeText(plant?.location || plant?.placement || plant?.placementLocation)
}

function resolvePlantDate(plant = {}) {
  return normalizeText(
    plant?.plantDate || plant?.plantingDate || plant?.acquiredAt || plant?.createdAt
  )
}

export function getPlantProfileCompletenessDetail(plant = {}) {
  const identityName = resolveIdentityName(plant)
  const careLocation = normalizePlantCareLocation(plant?.careLocation)
  const placementLocation = resolvePlacementLocation(plant)
  const plantDate = resolvePlantDate(plant)
  const lightEnvironment = plant?.lightEnvironment
  const hasLight = hasMeaningfulLightEnvironment(lightEnvironment)

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
    placementLocation: {
      earned: placementLocation ? WEIGHTS.placementLocation : 0,
      max: WEIGHTS.placementLocation,
      satisfied: Boolean(placementLocation),
      label: '摆放位置'
    },
    plantDate: {
      earned: plantDate ? WEIGHTS.plantDate : 0,
      max: WEIGHTS.plantDate,
      satisfied: Boolean(plantDate),
      label: '种植日期'
    },
    lightEnvironment: {
      earned: hasLight ? WEIGHTS.lightEnvironment : 0,
      max: WEIGHTS.lightEnvironment,
      satisfied: hasLight,
      optional: true,
      label: '光照环境'
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
