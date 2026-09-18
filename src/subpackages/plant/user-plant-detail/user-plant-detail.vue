<template>
  <UserPlantDetailView v-if="ready && mode === 'view'" ref="viewRef" :plant-id="Number(plantId)" />
  <UserPlantDetailForm
    v-else-if="ready"
    ref="formRef"
    :mode="mode"
    :plant-id="plantId"
    :initial-catalog-plant-id="initialCatalogPlantId"
    :initial-pot-profile="initialPotProfile"
    :initial-identify-image-path="initialIdentifyImagePath"
    :initial-identify-result="initialIdentifyResult"
  />
</template>

<script setup>
import { getCurrentInstance, ref } from 'vue'
import { onBackPress, onLoad, onShow } from '@dcloudio/uni-app'
import UserPlantDetailForm from './components/UserPlantDetailForm.vue'
import UserPlantDetailView from './components/UserPlantDetailView.vue'

const VALID_MODES = ['create', 'edit', 'view']
const mode = ref('create')
const plantId = ref('')
const initialCatalogPlantId = ref('')
const initialIdentifyImagePath = ref('')
const initialIdentifyResult = ref(null)
const initialPotProfile = ref(null)
const ready = ref(false)
const formRef = ref(null)
const viewRef = ref(null)
const pageInstance = getCurrentInstance()

onLoad(options => {
  const eventChannel = pageInstance?.proxy?.getOpenerEventChannel?.()
  eventChannel?.on('home-ai-identify-result', payload => {
    initialIdentifyResult.value = normalizeInitialIdentifyResult(payload)
  })
  plantId.value = String(options?.id || '').trim()
  initialCatalogPlantId.value = String(options?.catalogPlantId || '').trim()
  initialIdentifyImagePath.value = decodeRouteValue(options?.identifyImagePath)
  initialPotProfile.value = decodeRouteJson(options?.initialPotProfile)
  mode.value = normalizeMode(options?.mode, plantId.value)
  ready.value = true
})

onShow(() => {
  if (mode.value === 'view') {
    viewRef.value?.refresh?.()
  }
})

onBackPress(() => formRef.value?.handleBackPress?.() || false)

function normalizeMode(requestedMode, id) {
  const normalizedMode = String(requestedMode || '').trim()
  if (VALID_MODES.includes(normalizedMode) && (normalizedMode === 'create' || id)) {
    return normalizedMode
  }
  return id ? 'view' : 'create'
}

function decodeRouteValue(value) {
  const rawValue = String(value || '').trim()
  if (!rawValue) {
    return ''
  }
  try {
    return decodeURIComponent(rawValue)
  } catch {
    return rawValue
  }
}

function decodeRouteJson(value) {
  const decoded = decodeRouteValue(value)
  if (!decoded) {
    return null
  }
  try {
    const parsed = JSON.parse(decoded)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function normalizeInitialIdentifyResult(payload) {
  const rawFormData = payload?.formData
  const formData =
    rawFormData && typeof rawFormData === 'object' && !Array.isArray(rawFormData)
      ? {
          image: String(rawFormData.image || '').trim(),
          imageFileId: String(rawFormData.imageFileId || '').trim()
        }
      : null
  const selectedPlant =
    payload?.selectedPlant && typeof payload.selectedPlant === 'object'
      ? { ...payload.selectedPlant }
      : null
  const recognizedName = String(payload?.recognizedName || '').trim()
  const identifyContext =
    payload?.identifyContext && typeof payload.identifyContext === 'object'
      ? { ...payload.identifyContext }
      : null
  if (!formData || (!selectedPlant && !recognizedName)) {
    return null
  }
  return {
    formData,
    selectedPlant,
    recognizedName,
    identifyContext
  }
}
</script>
