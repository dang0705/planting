/* oxlint-disable no-unused-vars, no-magic-numbers */
import { computed, watch } from 'vue'
import { resolveRiskSkipAction } from './question-skip'
import { mergeQuestionStateFactory } from './question-flow-helpers'

export function useDiagnoseQuestionFlow(ctx) {
  const {
    props,
    emit,
    userStore,
    diagnoseStore,
    result,
    casePreviewImages,
    questionAnswers,
    careBehaviorTimelineByQuestionId,
    environmentWeatherWindow,
    questionStack,
    activeQuestionIndex,
    committedQuestionAnswers,
    dirtyQuestionFromIndex,
    questionAnswerRevision,
    expandedQuestionOptionByQuestion,
    submittingQuestionMode,
    diagnosisAnswerMutation,
    additionalImageFiles,
    hasPendingAdditionalImageUploads,
    hasAdditionalImageUploadErrors,
    getQuestionId,
    createQuestionAnswerMap,
    isQuestionAnswerComplete,
    buildQuestionAnswerPayload,
    normalizeDiagnosisResult,
    isCareBehaviorTimelineSentinelAnswer,
    isCareBehaviorWateringTimelineQuestion,
    resolveCareBehaviorTimelineAutoAnswerOptionId,
    resolveCareBehaviorTimelineRecordedAnswerOptionId
  } = ctx

  const currentQuestion = {
    get value() {
      return ctx.currentQuestion?.value
    }
  }
  const hasDirtyQuestionAnswers = {
    get value() {
      return Boolean(ctx.hasDirtyQuestionAnswers?.value)
    }
  }
  const isSubmittingQuestionFlow = {
    get value() {
      return Boolean(ctx.isSubmittingQuestionFlow?.value)
    }
  }
  const refreshEnvironmentWeatherWindowForCareBehavior = (...args) =>
    ctx.refreshEnvironmentWeatherWindowForCareBehavior(...args)
  const getCasePreviewImages = (...args) => ctx.getCasePreviewImages(...args)
  const findQuestionById = (...args) => ctx.findQuestionById(...args)
  const buildCareBehaviorTimelineByQuestionIdMap = (...args) =>
    ctx.buildCareBehaviorTimelineByQuestionIdMap(...args)
  const isAccordionQuestion = (...args) => ctx.isAccordionQuestion(...args)
  const isQuestionRiskOptionBlocked = (...args) => ctx.isQuestionRiskOptionBlocked?.(...args)
  const enrichDiagnosisResult = (...args) => ctx.enrichDiagnosisResult?.(...args) || args[0]
  const retakeExpired = {
    get value() {
      return Boolean(ctx.retakeExpired?.value)
    }
  }

  function getQuestionOptionId(option) {
    return String(option?.optionId || '').trim()
  }

  function getExpandedQuestionOptionId(question) {
    const questionId = getQuestionId(question)
    if (!questionId) {
      return ''
    }
    return String(
      expandedQuestionOptionByQuestion.value[questionId] ||
        questionAnswers.value[questionId] ||
        question?.defaultOptionId ||
        ''
    ).trim()
  }

  function normalizeCollapseOptionValue(value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return normalizeCollapseOptionValue(value.detail?.value ?? value.detail ?? value.value ?? '')
    }
    if (Array.isArray(value)) {
      return String(value[0] || '').trim()
    }
    return String(value || '').trim()
  }

  function setExpandedQuestionOption(question, optionId) {
    const questionId = getQuestionId(question)
    const normalizedOptionId = String(optionId || '').trim()
    if (!questionId || !normalizedOptionId) {
      return
    }
    expandedQuestionOptionByQuestion.value = {
      ...expandedQuestionOptionByQuestion.value,
      [questionId]: normalizedOptionId
    }
  }

  function handleQuestionAccordionChange(question, value) {
    const optionId = normalizeCollapseOptionValue(value)
    if (!optionId) {
      return
    }
    setExpandedQuestionOption(question, optionId)
    setQuestionAnswer(getQuestionId(question), optionId)
  }

  function isQuestionOptionExpanded(question, option) {
    if (!isAccordionQuestion(question)) {
      return true
    }
    const optionId = getQuestionOptionId(option)
    return Boolean(optionId && getExpandedQuestionOptionId(question) === optionId)
  }

  function isSelectedQuestionOption(question, option) {
    const questionId = getQuestionId(question)
    const optionId = getQuestionOptionId(option)
    if (!questionId || !optionId) {
      return false
    }
    const selectedOptionId = String(
      questionAnswers.value[questionId] || question?.defaultOptionId || ''
    ).trim()
    return selectedOptionId === optionId
  }

  function selectQuestionOption(question, option) {
    const questionId = getQuestionId(question)
    const optionId = getQuestionOptionId(option)
    if (!questionId || !optionId) {
      return
    }
    if (isQuestionRiskOptionBlocked(question, option)) {
      uni.showToast({ title: '请先确认愿意操作，或选择跳过', icon: 'none' })
      return
    }
    setQuestionAnswer(questionId, optionId)
    if (isAccordionQuestion(question)) {
      setExpandedQuestionOption(question, optionId)
    }
  }

  function findQuestionIndex(questionId = '') {
    const normalizedQuestionId = String(questionId || '').trim()
    if (!normalizedQuestionId) {
      return -1
    }
    return questionStack.value.findIndex(item => getQuestionId(item) === normalizedQuestionId)
  }

  function updateDirtyQuestionIndex(questionId = '', optionId = '') {
    const questionIndex = findQuestionIndex(questionId)
    if (questionIndex < 0) {
      return
    }

    const committedOptionId = String(
      committedQuestionAnswers.value?.[questionId]?.optionId || ''
    ).trim()
    const isHistoricalQuestion = questionIndex < questionStack.value.length - 1

    if (committedOptionId && committedOptionId === String(optionId || '').trim()) {
      return
    }

    if (!committedOptionId && !isHistoricalQuestion) {
      return
    }

    dirtyQuestionFromIndex.value =
      dirtyQuestionFromIndex.value >= 0
        ? Math.min(dirtyQuestionFromIndex.value, questionIndex)
        : questionIndex
  }

  function goPreviousQuestion() {
    activeQuestionIndex.value = Math.max(0, activeQuestionIndex.value - 1)
  }

  function goNextQuestion() {
    if (
      hasDirtyQuestionAnswers.value &&
      activeQuestionIndex.value >= dirtyQuestionFromIndex.value
    ) {
      return
    }
    activeQuestionIndex.value = Math.min(
      Math.max(questionStack.value.length - 1, 0),
      activeQuestionIndex.value + 1
    )
  }

  // 0.90-<0.95 很像结果的可选排查问题：用户可答可不答，提交时不强制校验答案。
  const isOptionalFollowUpQuestion = computed(
    () =>
      Boolean(result.value?.uiHints?.optionalFollowUp) ||
      Boolean(result.value?.questionPackage?.optionalFollowUp)
  )

  function canProceedQuestion() {
    const question = currentQuestion.value
    const questionId = getQuestionId(question)
    if (!questionId) {
      return false
    }
    if (isSubmittingQuestionFlow.value) {
      return false
    }
    if (retakeExpired.value) {
      return false
    }
    if (
      additionalImageFiles.value.length > 0 ||
      hasPendingAdditionalImageUploads.value ||
      hasAdditionalImageUploadErrors.value
    ) {
      return false
    }
    // 0.90-<0.95 很像结果的可选排查问题：允许未答提交（跳过）。
    if (isOptionalFollowUpQuestion.value) {
      return true
    }
    return Boolean(questionAnswers.value[questionId])
  }
  const canProceedQuestionNow = computed(() => canProceedQuestion())

  async function handleNextQuestion() {
    if (!canProceedQuestion()) {
      return
    }

    if (
      !hasDirtyQuestionAnswers.value &&
      activeQuestionIndex.value < questionStack.value.length - 1
    ) {
      goNextQuestion()
      return
    }

    await submitQuestionAnswers()
  }

  function resetQuestionState(questions = [], { answerRevision = 0 } = {}) {
    const nextQuestions = Array.isArray(questions)
      ? questions.filter(item => getQuestionId(item))
      : []
    questionStack.value = nextQuestions
    activeQuestionIndex.value = 0
    questionAnswers.value = createQuestionAnswerMap(nextQuestions)
    careBehaviorTimelineByQuestionId.value = buildCareBehaviorTimelineByQuestionIdMap(nextQuestions)
    committedQuestionAnswers.value = {}
    dirtyQuestionFromIndex.value = -1
    questionAnswerRevision.value = Number(answerRevision || 0)
    expandedQuestionOptionByQuestion.value = {}
    refreshEnvironmentWeatherWindowForCareBehavior(nextQuestions)
  }

  function mergeQuestionState(nextResult = null, submittedPayload = null) {
    return mergeQuestionStateImpl(nextResult, submittedPayload)
  }

  const mergeQuestionStateImpl = mergeQuestionStateFactory({
    questionStack,
    questionAnswers,
    careBehaviorTimelineByQuestionId,
    committedQuestionAnswers,
    dirtyQuestionFromIndex,
    questionAnswerRevision,
    activeQuestionIndex,
    expandedQuestionOptionByQuestion,
    getQuestionId,
    createQuestionAnswerMap,
    buildCareBehaviorTimelineByQuestionIdMap,
    refreshEnvironmentWeatherWindowForCareBehavior,
    findQuestionIndex
  })

  watch(
    () => [
      userStore.location?.latitude,
      userStore.location?.longitude,
      userStore.location?.city,
      userStore.location?.province,
      questionStack.value.map(item => getQuestionId(item)).join('|')
    ],
    () => {
      refreshEnvironmentWeatherWindowForCareBehavior()
    }
  )

  function setQuestionAnswer(questionId, answerValue) {
    updateDirtyQuestionIndex(questionId, answerValue)
    questionAnswers.value = {
      ...questionAnswers.value,
      [questionId]: answerValue
    }

    const question = findQuestionById(questionId)
    if (!question || !isCareBehaviorWateringTimelineQuestion(question)) {
      return
    }

    const answerId = String(answerValue || '').trim()
    const autoAnswerId = resolveCareBehaviorTimelineAutoAnswerOptionId(question)
    if (isCareBehaviorTimelineSentinelAnswer(question, answerId) || answerId === autoAnswerId) {
      return
    }
    careBehaviorTimelineByQuestionId.value = {
      ...careBehaviorTimelineByQuestionId.value,
      [questionId]: {}
    }
  }

  async function skipQuestionRisk(question) {
    const questionId = getQuestionId(question)
    if (!questionId) {
      return
    }
    const action = resolveRiskSkipAction({
      activeQuestionIndex: activeQuestionIndex.value,
      questionStackLength: questionStack.value.length
    })
    setQuestionAnswer(questionId, action.answerValue)
    if (action.shouldAdvance) {
      goNextQuestion()
      return
    }
    if (action.shouldSubmit) {
      await submitQuestionAnswers()
    }
  }

  function canSubmitQuestionAnswers() {
    if (
      additionalImageFiles.value.length > 0 ||
      hasPendingAdditionalImageUploads.value ||
      hasAdditionalImageUploadErrors.value
    ) {
      return false
    }

    // 0.90-<0.95 很像结果的可选排查问题：允许未答提交（用户可跳过）。
    if (isOptionalFollowUpQuestion.value) {
      return true
    }

    if (
      !hasDirtyQuestionAnswers.value &&
      activeQuestionIndex.value < questionStack.value.length - 1
    ) {
      return false
    }

    return isQuestionAnswerComplete(
      questionStack.value.slice(0, activeQuestionIndex.value + 1),
      questionAnswers.value
    )
  }

  async function submitQuestionAnswers() {
    if (!result.value || !canSubmitQuestionAnswers()) {
      return
    }

    submittingQuestionMode.value = 'answers'
    try {
      const isPackageSubmit =
        result.value?.uiHints?.answerSubmitMode === 'package' ||
        result.value?.questionPackage?.answerSubmitMode === 'package'
      const isRevisionSubmit = !isPackageSubmit && hasDirtyQuestionAnswers.value
      const submitQuestionStack = isRevisionSubmit
        ? questionStack.value.slice(0, activeQuestionIndex.value + 1)
        : isPackageSubmit
          ? questionStack.value
          : currentQuestion.value
            ? [currentQuestion.value]
            : []
      // 可选追问问题跳过时提交明确 unknown，不发送 answers:[]。
      const submitAnswerMap = { ...questionAnswers.value }
      if (isOptionalFollowUpQuestion.value) {
        for (const question of submitQuestionStack) {
          const questionId = getQuestionId(question)
          if (questionId && !submitAnswerMap[questionId]) {
            submitAnswerMap[questionId] = 'unknown'
          }
        }
      }
      const payload = buildQuestionAnswerPayload(result.value, submitAnswerMap, {
        questionStack: submitQuestionStack,
        requestMode: isRevisionSubmit ? 'answer_revision' : 'answer_submit',
        baseAnswerRevision: questionAnswerRevision.value,
        dirtyFromQuestionId:
          dirtyQuestionFromIndex.value >= 0
            ? getQuestionId(questionStack.value[dirtyQuestionFromIndex.value])
            : '',
        careBehaviorTimelineByQuestionId: careBehaviorTimelineByQuestionId.value,
        environmentWeatherWindow: environmentWeatherWindow.value
      })
      const rerunResult = await diagnosisAnswerMutation.mutateAsync(payload)

      const previewImages = getCasePreviewImages({ includeAdditionalImages: false })
      casePreviewImages.value = previewImages
      result.value = enrichDiagnosisResult(
        normalizeDiagnosisResult(rerunResult, {
          images: previewImages,
          plantName: props.plantName || result.value.plantName || '植物'
        }),
        rerunResult
      )
      mergeQuestionState(result.value, payload)

      diagnoseStore.addToHistory({
        images: previewImages,
        diagnosis: result.value,
        diagnosisId: result.value.diagnosisSessionId || ''
      })
      emit('success', result.value)

      uni.showToast({
        title: result.value.hasActiveQuestions ? '问诊已更新' : '诊断已收敛',
        icon: 'success'
      })
    } catch (error) {
      console.error('问诊处理失败:', error)
      uni.showToast({ title: error.message || '问诊失败，请重试', icon: 'none' })
    } finally {
      submittingQuestionMode.value = ''
    }
  }

  return {
    getQuestionOptionId,
    getExpandedQuestionOptionId,
    normalizeCollapseOptionValue,
    setExpandedQuestionOption,
    handleQuestionAccordionChange,
    isQuestionOptionExpanded,
    isSelectedQuestionOption,
    selectQuestionOption,
    findQuestionIndex,
    updateDirtyQuestionIndex,
    goPreviousQuestion,
    canProceedQuestionNow,
    handleNextQuestion,
    isOptionalFollowUpQuestion,
    resetQuestionState,
    mergeQuestionState,
    setQuestionAnswer,
    skipQuestionRisk,
    canSubmitQuestionAnswers,
    submitQuestionAnswers
  }
}
