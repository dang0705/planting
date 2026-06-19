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
  return (
    plantStore.userPlants.find(
      item => normalizeText(item.id) === plantId || normalizeText(item.plantId) === plantId
    ) || null
  )
}

export async function resolveDiagnosisCareLocation({ result = {}, plantStore, userLocation } = {}) {
  const plant = findDiagnosisPlant({ result, plantStore })
  const plantCareLocation = normalizePlantCareLocation(plant?.careLocation)
  if (plantCareLocation?.locationKey) {
    return {
      ...plantCareLocation,
      plantId: normalizeText(plant?.id || result.userPlantId || result.plantId),
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
  const plantId = normalizeText(plant?.id || result.userPlantId || result.plantId)
  if (plantId) {
    patchUserPlant({ id: plantId, careLocation: legacyCareLocation }).catch(() => {})
  }
  return {
    ...legacyCareLocation,
    plantId,
    source: CARE_LOCATION_SOURCE.LEGACY_USER_LOCATION
  }
}
