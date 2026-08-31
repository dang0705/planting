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
import {
  executeCompleteWateringReminderMutation,
  executeSaveWateringReminderMutation
} from '@/vue-query/plants/mutations/watering-reminders.js'
import { executeFertilizationReminderMutation } from '@/vue-query/plants/mutations/fertilization-reminders.js'
import { executeIdentifyPlantMutation } from '@/vue-query/plants/mutations/identify.js'
import { fetchWateringReminderQuery } from '@/vue-query/plants/queries/watering-reminders.js'
import {
  fetchFertilizationReminderFresh,
  fetchFertilizationReminderQuery
} from '@/vue-query/plants/queries/fertilization-reminders.js'
import { executePatchUserPlantAirEnvironmentMutation } from '@/vue-query/plants/mutations/air-environment.js'
import { resolvePayloadCareLocation } from '@/utils/plant-care-location.js'
import { requestHttpFunction } from '@/api/http.js'

export function fetchPlantCatalog(keyword = '', page = 1, pageSize = 10) {
  return fetchPlantCatalogQuery(keyword, page, pageSize)
}

export function mapPlantCatalog(keyword) {
  return fetchPlantCatalogMapQuery(keyword)
}

export function fetchUserPlants(page = 1, pageSize = 20) {
  return fetchUserPlantsQuery(page, pageSize)
}

export function fetchUserPlant(id) {
  return requestHttpFunction('plant-user-http/user-plants', {
    method: 'GET',
    query: { id: Number(id) }
  })
}

export function createUserPlant(payload) {
  return executeCreateUserPlantMutation(withCareLocation(payload, { allowStorageFallback: true }))
}

export function patchUserPlant(payload) {
  return executePatchUserPlantMutation(withCareLocation(payload, { allowStorageFallback: false }))
}

export function fetchUserPlantAirEnvironment(plantId) {
  return requestHttpFunction('plant-user-http/user-plants/air-environment', {
    method: 'GET',
    query: { plantId: Number(plantId) }
  })
}

export function patchUserPlantAirEnvironment(payload) {
  return executePatchUserPlantAirEnvironmentMutation(payload)
}

export async function fetchUserPlantWateringPlanner(payload = {}) {
  const response = await requestHttpFunction('plant-user-http/user-plants/watering-planner', {
    method: 'POST',
    body: payload
  })
  return response?.code === 200 ? response.data : null
}

function withCareLocation(payload = {}, options = {}) {
  const careLocation = resolvePayloadCareLocation(payload, options)
  return careLocation ? { ...payload, careLocation } : payload
}

export function removeUserPlant(id) {
  return executeRemoveUserPlantMutation(id)
}

export function fetchWateringReminder(plantId) {
  return fetchWateringReminderQuery(plantId)
}

export function saveWateringReminder(payload) {
  return executeSaveWateringReminderMutation(payload)
}

export function completeWateringReminder(payload) {
  return executeCompleteWateringReminderMutation(payload)
}

export function fetchFertilizationReminder(plantId) {
  return fetchFertilizationReminderQuery(plantId)
}

export function fetchFertilizationReminderFreshState(plantId) {
  return fetchFertilizationReminderFresh(plantId)
}

export function previewFertilizationReminder(payload) {
  return executeFertilizationReminderMutation('preview', payload)
}

export function confirmFertilizationReminder(payload) {
  return executeFertilizationReminderMutation('confirm', payload)
}

export function completeFertilizationReminder(payload) {
  return executeFertilizationReminderMutation('complete', payload)
}

export function dismissFertilizationReminder(payload) {
  return executeFertilizationReminderMutation('dismiss', payload)
}

export function cancelFertilizationReminder(payload) {
  return executeFertilizationReminderMutation('cancel', payload)
}

export function identifyPlantByImage(imageUrl) {
  return executeIdentifyPlantMutation(imageUrl)
}
