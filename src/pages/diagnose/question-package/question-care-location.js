import { patchUserPlant } from '@/api/plants-http.js'
import { resolveHotCityByGps } from '@/api/weather-hot-cities.js'
import {
  buildLegacyUserCareLocation,
  CARE_LOCATION_SOURCE,
  normalizePlantCareLocation
} from '@/utils/plant-care-location.js'

function normalizeText(value = '') {
  return String(value || '').trim()
}

export function findDiagnosisPlant({ result = {}, plantStore } = {}) {
  const plantId = normalizeText(result.userPlantId || result.plantId)
  if (!plantId) {
    return null
  }
  const userPlants = Array.isArray(plantStore?.userPlants) ? plantStore.userPlants : []
  return (
    userPlants.find(
      item => normalizeText(item.id) === plantId || normalizeText(item.plantId) === plantId
    ) || null
  )
}

function getRealPlantId(plant = null) {
  return plant ? normalizeText(plant.id || plant.plantId) : ''
}

export async function resolveDiagnosisCareLocation({ result = {}, plantStore, userLocation } = {}) {
  const plant = findDiagnosisPlant({ result, plantStore })
  const realPlantId = getRealPlantId(plant)
  const plantCareLocation = normalizePlantCareLocation(plant?.careLocation)
  if (plantCareLocation?.locationKey) {
    return {
      ...plantCareLocation,
      plantId: realPlantId,
      source: plantCareLocation.source || CARE_LOCATION_SOURCE.MANUAL_SELECTED
    }
  }

  if (!userLocation?.latitude || !userLocation?.longitude) {
    return null
  }
  const resolved = await resolveHotCityByGps(userLocation).catch(() => null)
  if (!resolved?.matched || !resolved.city) {
    return null
  }
  const legacyCareLocation = buildLegacyUserCareLocation(resolved.city)
  if (!legacyCareLocation) {
    return null
  }
  if (realPlantId) {
    patchUserPlant({ id: realPlantId, careLocation: legacyCareLocation }).catch(() => {})
  }
  return {
    ...legacyCareLocation,
    plantId: realPlantId,
    source: CARE_LOCATION_SOURCE.LEGACY_USER_LOCATION
  }
}
