import { computed, ref } from 'vue'
import {
  describeAirEnvironmentInput,
  getAirEnvironmentSignature,
  isAirEnvironmentAnswerReady,
  isCompleteAirEnvironmentProfile,
  isSameAirEnvironmentLocationBinding,
  normalizeAirEnvironmentLocationBinding,
  sanitizeAirEnvironmentInput
} from '@/utils/air-environment.js'

export function useWateringAdvisorAirEnvironment({
  airEnvironment,
  selectedCatalogPlant,
  isUserPlant
}) {
  const airEnvironmentEditorOpen = ref(true)
  const airEnvironmentNeedsConfirmation = ref(false)
  const frozenAirEnvironmentOverride = ref(null)
  const airEnvironmentSyncState = ref('idle')
  const currentAirEnvironmentLocationBinding = computed(() =>
    normalizeAirEnvironmentLocationBinding({
      careLocationId: selectedCatalogPlant.value?.careLocationId || '',
      locationKey: selectedCatalogPlant.value?.locationKey || ''
    })
  )
  const hasCompleteSavedAirEnvironment = computed(() =>
    isCompleteAirEnvironmentProfile(airEnvironment.profile.value)
  )
  const savedAirEnvironmentMatchesCurrentLocation = computed(
    () =>
      hasCompleteSavedAirEnvironment.value &&
      isSameAirEnvironmentLocationBinding(
        airEnvironment.profile.value?.locationBinding,
        currentAirEnvironmentLocationBinding.value
      )
  )
  const showSavedAirEnvironmentSummary = computed(
    () => hasCompleteSavedAirEnvironment.value && !airEnvironmentEditorOpen.value
  )
  const savedAirEnvironmentSummary = computed(() =>
    describeAirEnvironmentInput(airEnvironment.profile.value?.input)
  )
  const airEnvironmentSyncMessage = computed(() => {
    if (airEnvironmentSyncState.value === 'syncing') {
      return '正在同步到植物…'
    }
    if (airEnvironmentSyncState.value === 'saved') {
      return '已保存到植物'
    }
    if (airEnvironmentSyncState.value === 'failed') {
      return '本次已使用，但暂未保存'
    }
    return ''
  })

  function reset() {
    airEnvironmentEditorOpen.value = true
    airEnvironmentNeedsConfirmation.value = false
    frozenAirEnvironmentOverride.value = null
    airEnvironmentSyncState.value = 'idle'
  }

  async function loadForUserPlant(plantId) {
    reset()
    const profile = await airEnvironment.load(plantId, { preserveDraft: true })
    if (!profile || airEnvironment.dirty.value) {
      return profile
    }
    airEnvironmentNeedsConfirmation.value = !isSameAirEnvironmentLocationBinding(
      profile.locationBinding,
      currentAirEnvironmentLocationBinding.value
    )
    airEnvironmentEditorOpen.value =
      !isCompleteAirEnvironmentProfile(profile) || airEnvironmentNeedsConfirmation.value
    return profile
  }

  function handleChange(value) {
    airEnvironment.setDraft(value)
    airEnvironmentEditorOpen.value = true
    airEnvironmentNeedsConfirmation.value = false
  }

  function openEditor() {
    airEnvironmentEditorOpen.value = true
  }

  function confirmLocation() {
    airEnvironment.setDraft(airEnvironment.draft.value)
    airEnvironmentNeedsConfirmation.value = false
    airEnvironmentEditorOpen.value = false
  }

  function isUnchangedSavedAirEnvironment(input) {
    return (
      hasCompleteSavedAirEnvironment.value &&
      savedAirEnvironmentMatchesCurrentLocation.value &&
      !airEnvironment.dirty.value &&
      getAirEnvironmentSignature(airEnvironment.profile.value.input) ===
        getAirEnvironmentSignature(input)
    )
  }

  function startSync(input = frozenAirEnvironmentOverride.value) {
    if (!isUserPlant.value || !isAirEnvironmentAnswerReady(input)) {
      return
    }
    airEnvironmentSyncState.value = 'syncing'
    const writeMode = hasCompleteSavedAirEnvironment.value ? 'replace_if_match' : 'if_missing'
    airEnvironment
      .saveInBackground(
        selectedCatalogPlant.value.userPlantId,
        currentAirEnvironmentLocationBinding.value,
        {
          input,
          writeMode
        }
      )
      .then(({ response }) => {
        airEnvironmentSyncState.value = response?.code === 200 ? 'saved' : 'failed'
      })
      .catch(() => {
        airEnvironmentSyncState.value = 'failed'
      })
  }

  function freezeAndSync() {
    const input = sanitizeAirEnvironmentInput(airEnvironment.draft.value)
    frozenAirEnvironmentOverride.value = input
    if (isUnchangedSavedAirEnvironment(input)) {
      airEnvironmentSyncState.value = 'saved'
      return input
    }
    startSync(input)
    return input
  }

  function retrySave() {
    if (frozenAirEnvironmentOverride.value) {
      startSync(frozenAirEnvironmentOverride.value)
    }
  }

  return {
    airEnvironmentEditorOpen,
    airEnvironmentNeedsConfirmation,
    frozenAirEnvironmentOverride,
    airEnvironmentSyncState,
    showSavedAirEnvironmentSummary,
    savedAirEnvironmentSummary,
    airEnvironmentSyncMessage,
    reset,
    loadForUserPlant,
    handleChange,
    openEditor,
    confirmLocation,
    freezeAndSync,
    retrySave
  }
}
