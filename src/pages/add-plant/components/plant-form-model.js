export const DEFAULT_PLANT_LOCATION = '阳台'
const DATE_SEGMENT_INDEX = 0

function formatDate(value) {
  return (
    String(value || '').split('T')[DATE_SEGMENT_INDEX] ||
    new Date().toISOString().split('T')[DATE_SEGMENT_INDEX]
  )
}

function formatOptionalDate(value) {
  const normalized = String(value || '').split('T')[DATE_SEGMENT_INDEX]
  return normalized || ''
}

export function createInitialPlantForm() {
  return {
    image: '',
    nickname: '',
    location: DEFAULT_PLANT_LOCATION,
    careLocation: null,
    lightEnvironment: null,
    plantDate: formatDate(),
    notes: ''
  }
}

export function buildPlantFormFromUserPlant(plant = {}) {
  return {
    image: plant.image || '',
    nickname: plant.nickname || plant.displayName || '',
    location: plant.location || DEFAULT_PLANT_LOCATION,
    careLocation: plant.careLocation || null,
    lightEnvironment: plant.lightEnvironment || null,
    plantDate: formatOptionalDate(plant.plantDate),
    notes: plant.notes || ''
  }
}
