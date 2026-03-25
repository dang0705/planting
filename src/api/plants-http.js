import { requestHttpFunction } from '@/api/http'

export function fetchPlantCatalog(keyword = '', page = 1, pageSize = 10) {
  return requestHttpFunction('plant-catalog-http/catalog/plants', {
    query: {
      ...(keyword ? { keyword } : {}),
      page,
      pageSize
    },
    auth: true
  })
}

export function mapPlantCatalog(keyword) {
  return requestHttpFunction('plant-catalog-http/catalog/map', {
    query: { keyword },
    auth: true
  })
}

export function fetchUserPlants(page = 1, pageSize = 20) {
  return requestHttpFunction('plant-user-http/user-plants', {
    query: { page, pageSize }
  })
}

export function createUserPlant(payload) {
  return requestHttpFunction('plant-user-http/user-plants', {
    method: 'POST',
    body: payload
  })
}

export function patchUserPlant(payload) {
  return requestHttpFunction('plant-user-http/user-plants', {
    method: 'PATCH',
    body: payload
  })
}

export function removeUserPlant(id) {
  return requestHttpFunction('plant-user-http/user-plants', {
    method: 'DELETE',
    body: { id }
  })
}

export function identifyPlantByImage(imageUrl) {
  return requestHttpFunction('identify-http/identify/plant', {
    method: 'POST',
    body: { imageUrl }
  })
}

export function fetchDiagnosisHistory(page = 1, pageSize = 10, plantId = null) {
  return requestHttpFunction('diagnosis-history-http/diagnosis/history', {
    query: {
      page,
      pageSize,
      ...(plantId ? { plantId } : {})
    }
  })
}

export function fetchDiagnosisDetail(id) {
  return requestHttpFunction('diagnosis-history-http/diagnosis/history/detail', {
    query: { id }
  })
}

export function computeDiagnosisDecision(payload) {
  return requestHttpFunction('diagnosis-history-http/diagnosis/decision', {
    method: 'POST',
    body: payload
  })
}
