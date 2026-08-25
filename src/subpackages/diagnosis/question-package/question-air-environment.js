import { computed, ref } from 'vue'
import { fetchUserPlantAirEnvironment, patchUserPlantAirEnvironment } from '@/api/plants-http.js'
import {
  describeAirEnvironmentInput,
  isAirEnvironmentAnswerReady,
  isAirEnvironmentQuestion,
  isCompleteAirEnvironmentProfile,
  isSameAirEnvironmentLocationBinding,
  normalizeAirEnvironmentLocationBinding,
  sanitizeAirEnvironmentInput
} from '@/utils/air-environment.js'
import { getQuestionIdentity as getQuestionId } from '../utils/diagnose-question-identity.js'

const RECORDED_OPTION = 'air_environment_recorded'
const UNKNOWN_OPTION = 'air_environment_unknown'

function getBoundUserPlantId(result = {}) {
  return String(result?.plantContext?.userPlantId || result?.userPlantId || '').trim()
}

function getCurrentLocationBinding(result = {}, plantStore = null) {
  const userPlantId = getBoundUserPlantId(result)
  const plant = (plantStore?.userPlants || []).find(item => String(item?.id || '') === userPlantId)
  return normalizeAirEnvironmentLocationBinding({
    careLocationId:
      plant?.careLocationId || result?.plantContext?.careLocationId || result?.careLocationId || '',
    locationKey:
      plant?.locationKey || result?.plantContext?.locationKey || result?.locationKey || ''
  })
}

function cloneInput(value = {}) {
  return sanitizeAirEnvironmentInput(value)
}

export function useQuestionAirEnvironment({ result, plantStore, setQuestionAnswer }) {
  const byQuestionId = ref({})
  const sourceByQuestionId = ref({})
  const dirtyByQuestionId = ref({})
  const editorOpenByQuestionId = ref({})
  const requiresConfirmationByQuestionId = ref({})
  const profile = ref(null)
  const syncState = ref('idle')
  let requestVersion = 0

  const currentLocationBinding = computed(() => getCurrentLocationBinding(result.value, plantStore))

  function getAirQuestions(questions = []) {
    return (Array.isArray(questions) ? questions : []).filter(isAirEnvironmentQuestion)
  }

  function updateMap(target, questionId, value) {
    target.value = { ...target.value, [questionId]: value }
  }

  function removeMapEntry(target, questionId) {
    const next = { ...target.value }
    delete next[questionId]
    target.value = next
  }

  function setRecorded(
    questionId,
    input,
    source,
    { needsConfirmation = false, editorOpen = needsConfirmation } = {}
  ) {
    updateMap(byQuestionId, questionId, cloneInput(input))
    updateMap(sourceByQuestionId, questionId, source)
    updateMap(requiresConfirmationByQuestionId, questionId, needsConfirmation)
    updateMap(editorOpenByQuestionId, questionId, Boolean(editorOpen))
    setQuestionAnswer(questionId, RECORDED_OPTION)
  }

  function reset(questions = []) {
    const version = ++requestVersion
    byQuestionId.value = {}
    sourceByQuestionId.value = {}
    dirtyByQuestionId.value = {}
    editorOpenByQuestionId.value = {}
    requiresConfirmationByQuestionId.value = {}
    profile.value = null
    syncState.value = 'idle'
    const airQuestions = getAirQuestions(questions)
    for (const question of airQuestions) {
      const questionId = getQuestionId(question)
      if (questionId) {
        setQuestionAnswer(questionId, '')
      }
    }
    const userPlantId = getBoundUserPlantId(result.value)
    if (!userPlantId || !airQuestions.length) {
      return
    }
    fetchUserPlantAirEnvironment(userPlantId)
      .then(response => {
        if (version !== requestVersion || response?.code !== 200 || !response?.data?.input) {
          return
        }
        const nextProfile = response.data
        if (!isCompleteAirEnvironmentProfile(nextProfile)) {
          return
        }
        profile.value = nextProfile
        const input = cloneInput(nextProfile.input)
        const needsConfirmation = !isSameAirEnvironmentLocationBinding(
          nextProfile.locationBinding,
          currentLocationBinding.value
        )
        for (const question of airQuestions) {
          const questionId = getQuestionId(question)
          if (!questionId || dirtyByQuestionId.value[questionId]) {
            continue
          }
          setRecorded(questionId, input, 'saved_profile', { needsConfirmation })
        }
      })
      .catch(() => {})
  }

  function getByQuestion(question = {}) {
    return byQuestionId.value[getQuestionId(question)] || null
  }

  function getSummary(question = {}) {
    const input = getByQuestion(question)
    return isAirEnvironmentAnswerReady(input) ? describeAirEnvironmentInput(input) : ''
  }

  function isEditorOpen(question = {}) {
    return Boolean(editorOpenByQuestionId.value[getQuestionId(question)])
  }

  function needsConfirmation(question = {}) {
    return Boolean(requiresConfirmationByQuestionId.value[getQuestionId(question)])
  }

  function isSummaryVisible(question = {}) {
    const questionId = getQuestionId(question)
    return (
      Boolean(questionId && byQuestionId.value[questionId]) &&
      !editorOpenByQuestionId.value[questionId]
    )
  }

  function openEditor(question = {}) {
    const questionId = getQuestionId(question)
    if (questionId) {
      updateMap(editorOpenByQuestionId, questionId, true)
    }
  }

  function confirmSavedProfile(question = {}) {
    const questionId = getQuestionId(question)
    if (!questionId || !isAirEnvironmentAnswerReady(byQuestionId.value[questionId])) {
      return
    }
    updateMap(requiresConfirmationByQuestionId, questionId, false)
    updateMap(dirtyByQuestionId, questionId, true)
    updateMap(sourceByQuestionId, questionId, 'temporary')
    updateMap(editorOpenByQuestionId, questionId, false)
    setQuestionAnswer(questionId, RECORDED_OPTION)
  }

  function change(question = {}, value = {}) {
    const questionId = getQuestionId(question)
    if (!questionId) {
      return
    }
    const input = cloneInput(value)
    updateMap(dirtyByQuestionId, questionId, true)
    updateMap(requiresConfirmationByQuestionId, questionId, false)
    updateMap(editorOpenByQuestionId, questionId, true)
    // Keep the in-progress composite draft in the question-local state. The
    // user must be able to complete the three-part assessment across several
    // interactions; only a complete value is promoted to the answer payload.
    updateMap(byQuestionId, questionId, input)
    if (!isAirEnvironmentAnswerReady(input)) {
      removeMapEntry(sourceByQuestionId, questionId)
      setQuestionAnswer(questionId, '')
      return
    }
    setRecorded(questionId, input, 'temporary', { editorOpen: true })
  }

  function selectUnknown(question = {}) {
    const questionId = getQuestionId(question)
    if (!questionId) {
      return
    }
    removeMapEntry(byQuestionId, questionId)
    removeMapEntry(sourceByQuestionId, questionId)
    removeMapEntry(requiresConfirmationByQuestionId, questionId)
    updateMap(dirtyByQuestionId, questionId, true)
    updateMap(editorOpenByQuestionId, questionId, true)
    setQuestionAnswer(questionId, UNKNOWN_OPTION)
  }

  function isAnswered(question = {}, answer = '') {
    const questionId = getQuestionId(question)
    return (
      (answer === RECORDED_OPTION &&
        !requiresConfirmationByQuestionId.value[questionId] &&
        isAirEnvironmentAnswerReady(byQuestionId.value[questionId])) ||
      answer === UNKNOWN_OPTION
    )
  }

  function freezeForSubmit(questions = []) {
    const inputs = {}
    const snapshots = {}
    for (const question of getAirQuestions(questions)) {
      const questionId = getQuestionId(question)
      const input = byQuestionId.value[questionId]
      if (!questionId || !isAirEnvironmentAnswerReady(input)) {
        continue
      }
      const source = sourceByQuestionId.value[questionId] || 'temporary'
      inputs[questionId] = cloneInput(input)
      snapshots[questionId] = {
        input: cloneInput(input),
        source,
        profileUpdatedAt: source === 'saved_profile' ? String(profile.value?.updatedAt || '') : '',
        locationBinding:
          source === 'saved_profile'
            ? normalizeAirEnvironmentLocationBinding(profile.value?.locationBinding)
            : currentLocationBinding.value
      }
    }
    return { byQuestionId: inputs, snapshotsByQuestionId: snapshots }
  }

  function saveInBackground(questions = [], frozen = freezeForSubmit(questions)) {
    const userPlantId = getBoundUserPlantId(result.value)
    if (!userPlantId) {
      return Promise.resolve({ state: 'not_applicable' })
    }
    const question = getAirQuestions(questions).find(item => {
      const questionId = getQuestionId(item)
      return Boolean(dirtyByQuestionId.value[questionId] && frozen.byQuestionId[questionId])
    })
    const questionId = getQuestionId(question)
    const input = frozen.byQuestionId[questionId]
    if (!questionId || !input) {
      return Promise.resolve({ state: 'not_needed' })
    }
    syncState.value = 'syncing'
    const currentProfile = profile.value
    return patchUserPlantAirEnvironment({
      plantId: Number(userPlantId),
      airEnvironment: input,
      locationBinding: currentLocationBinding.value,
      writeMode: currentProfile ? 'replace_if_match' : 'if_missing',
      ...(currentProfile?.updatedAt ? { expectedUpdatedAt: currentProfile.updatedAt } : {})
    })
      .then(response => {
        if (response?.code !== 200 || !response.data) {
          syncState.value = 'failed'
          return { state: 'failed', response }
        }
        profile.value = response.data
        plantStore.applyAirEnvironmentLocal?.(Number(userPlantId), response.data)
        syncState.value = 'saved'
        return { state: 'saved', response }
      })
      .catch(error => {
        syncState.value = 'failed'
        return { state: 'failed', error }
      })
  }

  return {
    byQuestionId,
    sourceByQuestionId,
    syncState,
    reset,
    getByQuestion,
    getSummary,
    isSummaryVisible,
    isEditorOpen,
    needsConfirmation,
    openEditor,
    confirmSavedProfile,
    change,
    selectUnknown,
    isAnswered,
    freezeForSubmit,
    saveInBackground,
    isAirEnvironmentQuestion
  }
}
