import { computed, ref } from 'vue'
import { fetchUserPlantAirEnvironment, patchUserPlantAirEnvironment } from '@/api/plants-http.js'
import {
  isAirEnvironmentQuestion,
  isSameAirEnvironmentLocationBinding,
  normalizeAirEnvironmentLocationBinding
} from '@/utils/air-environment.js'
import {
  buildAdvancedAirEnvironmentAssessment,
  buildQuickAirEnvironmentAssessment,
  describeAirEnvironmentAssessment,
  getActiveAirEnvironmentAssessment,
  getCompletedQuickAirEnvironmentAnswer,
  getInitialAdvancedAirEnvironmentInput,
  getPreferredAirEnvironmentMode,
  normalizeAirEnvironmentProfile
} from '@/utils/air-environment-assessment.js'
import { getQuestionIdentity as getQuestionId } from '../utils/diagnose-question-identity.js'

const RECORDED_OPTION = 'air_environment_recorded'
const UNKNOWN_OPTION = 'air_environment_unknown'
const clone = value =>
  value === null || value === undefined ? value : JSON.parse(JSON.stringify(value))

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

export function isYellowLeafAirEnvironmentQuestion(question = {}) {
  const questionId = getQuestionId(question)
  return /yellow_leaf|leaf_yellowing/iu.test(questionId)
}

function buildDraftState(profile = null, allowQuick = true) {
  return {
    mode: allowQuick ? getPreferredAirEnvironmentMode(profile) : 'advanced',
    quickAnswer: allowQuick ? getCompletedQuickAirEnvironmentAnswer(profile) : null,
    advancedInput: getInitialAdvancedAirEnvironmentInput(profile)
  }
}

function normalizeAssessment(value = null) {
  if (Number(value?.schemaVersion) !== 3) {
    return null
  }
  const result =
    value.mode === 'quick'
      ? buildQuickAirEnvironmentAssessment({ selectedOptionKey: value.quickAnswer?.optionKey })
      : value.mode === 'advanced'
        ? buildAdvancedAirEnvironmentAssessment(value.advancedInput)
        : null
  return result?.ok ? result.value : null
}

export function useQuestionAirEnvironment({ result, plantStore, setQuestionAnswer }) {
  const completedByQuestionId = ref({})
  const draftByQuestionId = ref({})
  const sourceByQuestionId = ref({})
  const dirtyByQuestionId = ref({})
  const editorOpenByQuestionId = ref({})
  const requiresConfirmationByQuestionId = ref({})
  const profile = ref(null)
  const syncState = ref('idle')
  let requestVersion = 0

  const currentLocationBinding = computed(() => getCurrentLocationBinding(result.value, plantStore))
  const getAirQuestions = questions =>
    (Array.isArray(questions) ? questions : []).filter(isAirEnvironmentQuestion)

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
    assessment,
    source,
    { needsConfirmation = false, editorOpen = needsConfirmation } = {}
  ) {
    updateMap(completedByQuestionId, questionId, clone(assessment))
    updateMap(sourceByQuestionId, questionId, source)
    updateMap(requiresConfirmationByQuestionId, questionId, needsConfirmation)
    updateMap(editorOpenByQuestionId, questionId, Boolean(editorOpen))
    setQuestionAnswer(questionId, RECORDED_OPTION)
  }

  function reset(questions = []) {
    const version = ++requestVersion
    completedByQuestionId.value = {}
    draftByQuestionId.value = {}
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
        updateMap(
          draftByQuestionId,
          questionId,
          buildDraftState(null, isYellowLeafAirEnvironmentQuestion(question))
        )
        setQuestionAnswer(questionId, '')
      }
    }
    const userPlantId = getBoundUserPlantId(result.value)
    if (!userPlantId || !airQuestions.length) {
      return
    }
    fetchUserPlantAirEnvironment(userPlantId)
      .then(response => {
        if (version !== requestVersion || response?.code !== 200 || !response?.data) {
          return
        }
        const nextProfile = normalizeAirEnvironmentProfile(response.data)
        const activeAssessment = getActiveAirEnvironmentAssessment(nextProfile)
        if (!nextProfile || !activeAssessment) {
          return
        }
        profile.value = nextProfile
        const needsConfirmation = !isSameAirEnvironmentLocationBinding(
          nextProfile.locationBinding,
          currentLocationBinding.value
        )
        for (const question of airQuestions) {
          const questionId = getQuestionId(question)
          if (!questionId || dirtyByQuestionId.value[questionId]) {
            continue
          }
          const allowQuick = isYellowLeafAirEnvironmentQuestion(question)
          const draftState = buildDraftState(nextProfile, allowQuick)
          const assessment = allowQuick
            ? activeAssessment
            : buildAdvancedAirEnvironmentAssessment(draftState.advancedInput).value
          if (!assessment) {
            continue
          }
          updateMap(draftByQuestionId, questionId, clone(draftState))
          setRecorded(questionId, assessment, 'saved_profile', { needsConfirmation })
        }
      })
      .catch(() => {})
  }

  const getCompletedByQuestion = question =>
    completedByQuestionId.value[getQuestionId(question)] || null
  const getDraftState = question =>
    draftByQuestionId.value[getQuestionId(question)] ||
    buildDraftState(profile.value, isYellowLeafAirEnvironmentQuestion(question))
  const getSummary = question => describeAirEnvironmentAssessment(getCompletedByQuestion(question))
  const isEditorOpen = question => Boolean(editorOpenByQuestionId.value[getQuestionId(question)])
  const needsConfirmation = question =>
    Boolean(requiresConfirmationByQuestionId.value[getQuestionId(question)])
  const isSummaryVisible = question => {
    const questionId = getQuestionId(question)
    return Boolean(
      completedByQuestionId.value[questionId] && !editorOpenByQuestionId.value[questionId]
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
    if (!questionId || !normalizeAssessment(completedByQuestionId.value[questionId])) {
      return
    }
    updateMap(requiresConfirmationByQuestionId, questionId, false)
    updateMap(dirtyByQuestionId, questionId, true)
    updateMap(sourceByQuestionId, questionId, 'temporary')
    updateMap(editorOpenByQuestionId, questionId, false)
    setQuestionAnswer(questionId, RECORDED_OPTION)
  }

  function changeDraft(question = {}, value = {}) {
    const questionId = getQuestionId(question)
    if (!questionId) {
      return
    }
    const { editKind = 'answer', ...draftState } = value || {}
    updateMap(draftByQuestionId, questionId, clone(draftState))
    updateMap(editorOpenByQuestionId, questionId, true)
    if (editKind === 'mode_switch') {
      return
    }
    updateMap(dirtyByQuestionId, questionId, true)
    updateMap(requiresConfirmationByQuestionId, questionId, false)
  }

  function completeDraft(question = {}) {
    const questionId = getQuestionId(question)
    if (!questionId) {
      return false
    }
    if (needsConfirmation(question)) {
      uni.showToast({ title: '请确认植物位置或修改空气环境', icon: 'none' })
      return false
    }
    const draftState = getDraftState(question)
    const buildResult =
      draftState.mode === 'quick'
        ? buildQuickAirEnvironmentAssessment({
            selectedOptionKey: draftState.quickAnswer?.optionKey
          })
        : buildAdvancedAirEnvironmentAssessment(draftState.advancedInput)
    if (!buildResult.ok) {
      uni.showToast({ title: buildResult.userMessage, icon: 'none' })
      return false
    }
    setRecorded(questionId, buildResult.value, 'temporary', { editorOpen: false })
    return true
  }

  function selectUnknown(question = {}) {
    const questionId = getQuestionId(question)
    if (!questionId) {
      return
    }
    removeMapEntry(completedByQuestionId, questionId)
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
        Boolean(normalizeAssessment(completedByQuestionId.value[questionId]))) ||
      answer === UNKNOWN_OPTION
    )
  }

  function freezeForSubmit(questions = []) {
    const byQuestionId = {}
    const snapshotsByQuestionId = {}
    for (const question of getAirQuestions(questions)) {
      const questionId = getQuestionId(question)
      const assessment = normalizeAssessment(completedByQuestionId.value[questionId])
      if (!questionId || !assessment) {
        continue
      }
      const source = sourceByQuestionId.value[questionId] || 'temporary'
      byQuestionId[questionId] = clone(assessment)
      snapshotsByQuestionId[questionId] = {
        input: clone(assessment),
        source,
        profileUpdatedAt: source === 'saved_profile' ? String(profile.value?.updatedAt || '') : '',
        locationBinding:
          source === 'saved_profile'
            ? normalizeAirEnvironmentLocationBinding(profile.value?.locationBinding)
            : currentLocationBinding.value
      }
    }
    return { byQuestionId, snapshotsByQuestionId }
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
    const assessment = frozen.byQuestionId[questionId]
    if (!questionId || !assessment) {
      return Promise.resolve({ state: 'not_needed' })
    }
    syncState.value = 'syncing'
    const currentProfile = profile.value
    return patchUserPlantAirEnvironment({
      plantId: Number(userPlantId),
      airEnvironment: assessment,
      locationBinding: currentLocationBinding.value,
      writeMode: currentProfile ? 'replace_if_match' : 'if_missing',
      ...(currentProfile?.updatedAt ? { expectedUpdatedAt: currentProfile.updatedAt } : {})
    })
      .then(response => {
        if (response?.code !== 200 || !response.data) {
          syncState.value = 'failed'
          return { state: 'failed', response }
        }
        profile.value = normalizeAirEnvironmentProfile(response.data)
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
    profile,
    syncState,
    reset,
    getDraftState,
    getSummary,
    isSummaryVisible,
    isEditorOpen,
    needsConfirmation,
    openEditor,
    confirmSavedProfile,
    changeDraft,
    completeDraft,
    selectUnknown,
    isAnswered,
    freezeForSubmit,
    saveInBackground,
    isAirEnvironmentQuestion,
    isYellowLeafAirEnvironmentQuestion
  }
}
