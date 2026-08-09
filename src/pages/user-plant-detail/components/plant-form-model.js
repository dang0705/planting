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
    careLocation: null,
    lightEnvironment: null,
    airEnvironment: null,
    potProfile: null,
    plantDate: formatDate(),
    notes: ''
  }
}

export function buildPlantFormFromUserPlant(plant = {}) {
  return {
    image: plant.image || '',
    nickname: plant.nickname || plant.displayName || '',
    careLocation: plant.careLocation || null,
    lightEnvironment: plant.lightEnvironment || null,
    airEnvironment: plant.airEnvironment || null,
    potProfile: plant.potProfile || null,
    plantDate: formatOptionalDate(plant.plantDate),
    notes: plant.notes || ''
  }
}
