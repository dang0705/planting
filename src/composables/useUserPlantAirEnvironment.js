import { ref } from 'vue'
import { fetchUserPlantAirEnvironment, patchUserPlantAirEnvironment } from '@/api/plants-http.js'
import {
  createInitialAirEnvironmentInput,
  getAirEnvironmentSignature,
  normalizeAirEnvironmentLocationBinding,
  sanitizeAirEnvironmentInput
} from '@/utils/air-environment.js'
import {
  getCompletedAdvancedAirEnvironmentInput,
  normalizeAirEnvironmentProfile
} from '@/utils/air-environment-assessment.js'

function isVersionThreeAssessment(value = null) {
  return Number(value?.schemaVersion) === 3 && ['quick', 'advanced'].includes(value?.mode)
}

function getAssessmentSignature(value = null) {
  return isVersionThreeAssessment(value) ? JSON.stringify(value) : getAirEnvironmentSignature(value)
}

export function useUserPlantAirEnvironment({ plantStore = null } = {}) {
  const draft = ref(createInitialAirEnvironmentInput())
  const profile = ref(null)
  const loading = ref(false)
  const loadError = ref('')
  const dirty = ref(false)
  const activePlantId = ref('')
  let requestVersion = 0

  function reset(plantId = '') {
    requestVersion += 1
    activePlantId.value = String(plantId || '')
    draft.value = createInitialAirEnvironmentInput()
    profile.value = null
    loading.value = false
    loadError.value = ''
    dirty.value = false
  }

  function setDraft(value, { edited = true } = {}) {
    draft.value = sanitizeAirEnvironmentInput(value)
    if (edited) {
      dirty.value = true
    }
  }

  async function load(plantId, { preserveDraft = true } = {}) {
    const normalizedPlantId = String(plantId || '')
    if (!normalizedPlantId) {
      reset()
      return null
    }
    const version = ++requestVersion
    activePlantId.value = normalizedPlantId
    loading.value = true
    loadError.value = ''
    try {
      const response = await fetchUserPlantAirEnvironment(normalizedPlantId)
      if (version !== requestVersion || activePlantId.value !== normalizedPlantId) {
        return null
      }
      const nextProfile =
        response?.code === 200 ? normalizeAirEnvironmentProfile(response.data) : null
      profile.value = nextProfile
      const advancedInput = getCompletedAdvancedAirEnvironmentInput(nextProfile)
      if (advancedInput && (!preserveDraft || !dirty.value)) {
        draft.value = sanitizeAirEnvironmentInput(advancedInput)
      }
      if (response?.code !== 200) {
        loadError.value = response?.message || '暂时无法读取空气环境'
      }
      return nextProfile
    } catch (error) {
      if (version === requestVersion && activePlantId.value === normalizedPlantId) {
        loadError.value = error?.message || '暂时无法读取空气环境'
      }
      return null
    } finally {
      if (version === requestVersion && activePlantId.value === normalizedPlantId) {
        loading.value = false
      }
    }
  }

  function buildSavePayload(plantId, locationBinding = {}, options = {}) {
    const currentProfile = profile.value
    const writeMode = options.writeMode || (currentProfile ? 'replace_if_match' : 'if_missing')
    return {
      plantId: Number(plantId),
      airEnvironment: isVersionThreeAssessment(options.input)
        ? JSON.parse(JSON.stringify(options.input))
        : sanitizeAirEnvironmentInput(options.input || draft.value),
      locationBinding: normalizeAirEnvironmentLocationBinding(locationBinding),
      writeMode,
      ...(writeMode === 'replace_if_match' && currentProfile?.updatedAt
        ? { expectedUpdatedAt: currentProfile.updatedAt }
        : {})
    }
  }

  async function save(plantId, locationBinding = {}, options = {}) {
    const response = await patchUserPlantAirEnvironment(
      buildSavePayload(plantId, locationBinding, options)
    )
    if (response?.code === 200 && response.data) {
      profile.value = normalizeAirEnvironmentProfile(response.data)
      dirty.value = false
      plantStore?.applyAirEnvironmentLocal?.(Number(plantId), response.data)
    }
    return response
  }

  function saveInBackground(plantId, locationBinding = {}, options = {}) {
    const signature = getAssessmentSignature(options.input || draft.value)
    return save(plantId, locationBinding, options)
      .catch(() => null)
      .then(response => ({ response, signature }))
  }

  return {
    draft,
    profile,
    loading,
    loadError,
    dirty,
    reset,
    setDraft,
    load,
    save,
    saveInBackground
  }
}
