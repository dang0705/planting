import {
  fetchPlantCatalogQuery,
  fetchPlantCatalogMapQuery
} from '@/vue-query/plants/queries/catalog.js'
import { fetchUserPlantsQuery } from '@/vue-query/plants/queries/user-plants.js'
import {
  executeCreateUserPlantMutation,
  executePatchUserPlantMutation,
  executeRemoveUserPlantMutation
} from '@/vue-query/plants/mutations/user-plants.js'
import { executeIdentifyPlantMutation } from '@/vue-query/plants/mutations/identify.js'
import {
  fetchDiagnosisHistoryQuery,
  fetchDiagnosisDetailQuery
} from '@/vue-query/diagnosis-history/queries/history.js'
import {
  requestDiagnosisStart,
  requestDiagnosisAnswer,
  requestDiagnosisResult,
  requestDiagnosisHistory,
  requestDiagnosisFeedback
} from '@/http-functions/diagnose/client.js'

export function fetchPlantCatalog(keyword = '', page = 1, pageSize = 10) {
  return fetchPlantCatalogQuery(keyword, page, pageSize)
}

export function mapPlantCatalog(keyword) {
  return fetchPlantCatalogMapQuery(keyword)
}

export function fetchUserPlants(page = 1, pageSize = 20) {
  return fetchUserPlantsQuery(page, pageSize)
}

export function createUserPlant(payload) {
  return executeCreateUserPlantMutation(payload)
}

export function patchUserPlant(payload) {
  return executePatchUserPlantMutation(payload)
}

export function removeUserPlant(id) {
  return executeRemoveUserPlantMutation(id)
}

export function identifyPlantByImage(imageUrl) {
  return executeIdentifyPlantMutation(imageUrl)
}

export function fetchDiagnosisHistory(page = 1, pageSize = 10, plantId = null) {
  return fetchDiagnosisHistoryQuery(page, pageSize, plantId)
}

export function fetchDiagnosisDetail(id) {
  return fetchDiagnosisDetailQuery(id)
}

export function startDiagnosis(payload) {
  return requestDiagnosisStart(payload)
}

export function submitDiagnosisAnswers(payload) {
  return requestDiagnosisAnswer(payload)
}

export function getDiagnosisResult(params) {
  return requestDiagnosisResult(params)
}

export function getDiagnosisHistory(params) {
  return requestDiagnosisHistory(params)
}

export function submitDiagnosisFeedback(payload) {
  return requestDiagnosisFeedback(payload)
}
