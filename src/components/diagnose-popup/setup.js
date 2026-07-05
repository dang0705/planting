/* oxlint-disable no-unused-vars */
import { computed, onMounted, proxyRefs } from 'vue'
import * as deps from './deps.js'
import { createDiagnosePopupState } from './state.js'
import {
  AUTOMATION_DIAGNOSE_IMAGES_STORAGE_KEY as AUTOMATION_KEY,
  DIAGNOSIS_QUESTION_PACKAGE_STORAGE_KEY_PREFIX as QUESTION_PACKAGE_KEY_PREFIX,
  SYMPTOM_CLASS_QUICK_SELECT_OPTIONS as SYMPTOM_OPTIONS
} from './constants.js'
import { useDiagnoseComputed } from './computed.js'
import { useDiagnoseOutcomeAdvice } from './outcome-advice.js'
import { useDiagnoseQuestionText } from './question-text.js'
import { useDiagnoseCareBehavior } from './care-behavior.js'
import { useDiagnoseQuestionFlow } from './question-flow.js'
import { useDiagnosePopupActions } from './popup-actions.js'
import { useDiagnoseImages } from './images.js'
import { useDiagnoseDialogSubmit } from './dialog-submit.js'
import { useDiagnoseAutomation } from './automation.js'

const DEFAULT_COUNT = 0
const DEFAULT_INDEX = 0

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function asRecord(value) {
  return value && typeof value === 'object' ? value : {}
}

function normalizeSlotGroups(groups) {
  return asArray(groups).map(group => ({
    ...asRecord(group),
    slotType: String(group?.slotType || 'other'),
    label: String(group?.label || '其他'),
    capacity: Number(group?.capacity || DEFAULT_COUNT),
    canAdd: Boolean(group?.canAdd),
    items: asArray(group?.items).map(entry => ({
      ...asRecord(entry),
      index: Number(entry?.index || DEFAULT_INDEX),
      item: {
        id: String(entry?.item?.id || entry?.id || ''),
        previewUrl: String(entry?.item?.previewUrl || ''),
        loading: Boolean(entry?.item?.loading),
        status: String(entry?.item?.status || ''),
        error: String(entry?.item?.error || '')
      }
    }))
  }))
}

function normalizeAdviceGroups(groups) {
  return asArray(groups).map(group => ({
    ...asRecord(group),
    key: String(group?.key || ''),
    outcomeLabel: String(group?.outcomeLabel || ''),
    items: asArray(group?.items)
  }))
}

function getHealthClass(statusText = '') {
  const text = String(statusText || '')
  if (text.includes('健康')) {
    return 'rounded-full bg-green-50 px-2.5 py-1 text-green-700'
  }
  if (text.includes('严重') || text.includes('危险')) {
    return 'rounded-full bg-red-50 px-2.5 py-1 text-red-700'
  }
  return 'rounded-full bg-yellow-50 px-2.5 py-1 text-yellow-700'
}

export function setupDiagnosePopup(props, { emit, expose }) {
  const ctx = {
    props,
    emit,
    ...deps,
    ...createDiagnosePopupState(),
    AUTOMATION_DIAGNOSE_IMAGES_STORAGE_KEY: AUTOMATION_KEY,
    DIAGNOSIS_QUESTION_PACKAGE_STORAGE_KEY_PREFIX: QUESTION_PACKAGE_KEY_PREFIX,
    SYMPTOM_CLASS_QUICK_SELECT_OPTIONS: SYMPTOM_OPTIONS
  }
  Object.assign(ctx, useDiagnoseOutcomeAdvice(ctx))
  Object.assign(ctx, useDiagnoseQuestionText(ctx))
  Object.assign(ctx, useDiagnoseCareBehavior(ctx))
  Object.assign(ctx, useDiagnoseQuestionFlow(ctx))
  Object.assign(ctx, useDiagnosePopupActions(ctx))
  Object.assign(ctx, useDiagnoseImages(ctx))
  Object.assign(ctx, useDiagnoseDialogSubmit(ctx))
  Object.assign(ctx, useDiagnoseAutomation(ctx))
  Object.assign(ctx, useDiagnoseComputed(ctx))
  onMounted(() => {
    ctx.refreshViewportHeight()
  })
  expose({
    open: ctx.open,
    close: ctx.close,
    injectAutomationDiagnoseImages: ctx.injectAutomationDiagnoseImages
  })

  const viewModel = {
    popup: ctx.popup,
    result: ctx.result,
    showAIDialog: ctx.showAIDialog,
    aiStreamDialogRef: ctx.aiStreamDialogRef,
    pendingDiagnosePayload: ctx.pendingDiagnosePayload,
    casePreviewImages: ctx.casePreviewImages,
    questionAnswers: ctx.questionAnswers,
    careBehaviorTimelineByQuestionId: ctx.careBehaviorTimelineByQuestionId,
    environmentWeatherWindow: ctx.environmentWeatherWindow,
    environmentWeatherWindowLoading: ctx.environmentWeatherWindowLoading,
    environmentWeatherWindowError: computed(() =>
      String(ctx.environmentWeatherWindow?.value?.error || '')
    ),
    questionStack: computed(() => asArray(ctx.questionStack?.value)),
    activeQuestionIndex: ctx.activeQuestionIndex,
    committedQuestionAnswers: ctx.committedQuestionAnswers,
    dirtyQuestionFromIndex: ctx.dirtyQuestionFromIndex,
    questionAnswerRevision: ctx.questionAnswerRevision,
    expandedQuestionOptionByQuestion: ctx.expandedQuestionOptionByQuestion,
    submittingQuestionMode: ctx.submittingQuestionMode,
    imageFiles: computed(() => asArray(ctx.imageFiles?.value)),
    hasPendingUploads: ctx.hasPendingUploads,
    hasUploadErrors: ctx.hasUploadErrors,
    additionalImageFiles: computed(() => asArray(ctx.additionalImageFiles?.value)),
    hasPendingAdditionalImageUploads: ctx.hasPendingAdditionalImageUploads,
    hasAdditionalImageUploadErrors: ctx.hasAdditionalImageUploadErrors,
    automationEnabled: ctx.automationEnabled,
    PRIMARY_IMAGE_LIMIT: ctx.PRIMARY_IMAGE_LIMIT,
    ADDITIONAL_IMAGE_LIMIT: ctx.ADDITIONAL_IMAGE_LIMIT,
    SYMPTOM_CLASS_QUICK_SELECT_OPTIONS: asArray(ctx.SYMPTOM_CLASS_QUICK_SELECT_OPTIONS),
    selectedDevSymptomClassKey: ctx.selectedDevSymptomClassKey,
    primaryStructuredImages: ctx.primaryStructuredImages,
    additionalStructuredImages: ctx.additionalStructuredImages,
    selectedDevSymptomClassOption: ctx.selectedDevSymptomClassOption,
    hasSelectedSymptomMode: ctx.hasSelectedSymptomMode,
    additionalImageCaptureSuggestions: computed(() =>
      asArray(ctx.additionalImageCaptureSuggestions?.value)
    ),
    primarySlotGroups: computed(() => normalizeSlotGroups(ctx.primarySlotGroups?.value)),
    additionalImageSlotGroups: computed(() =>
      normalizeSlotGroups(ctx.additionalImageSlotGroups?.value)
    ),
    hasUsedAdditionalImageSubmission: ctx.hasUsedAdditionalImageSubmission,
    activeDiagnosisQuestions: ctx.activeDiagnosisQuestions,
    hasActiveDiagnosisQuestions: ctx.hasActiveDiagnosisQuestions,
    canShowAdditionalImageUploader: ctx.canShowAdditionalImageUploader,
    additionalImageUploadBlockedReason: ctx.additionalImageUploadBlockedReason,
    isSubmittingQuestionFlow: ctx.isSubmittingQuestionFlow,
    isSubmittingQuestionAnswer: ctx.isSubmittingQuestionAnswer,
    isSubmittingAdditionalImage: ctx.isSubmittingAdditionalImage,
    currentQuestion: ctx.currentQuestion,
    hasDirtyQuestionAnswers: ctx.hasDirtyQuestionAnswers,
    questionSwiperTrackStyle: computed(() => String(ctx.questionSwiperTrackStyle?.value || '')),
    questionSwiperPages: computed(() => asArray(ctx.questionSwiperPages?.value)),
    currentQuestionAccordionValue: ctx.currentQuestionAccordionValue,
    actionAdviceTexts: ctx.actionAdviceTexts,
    resultMainIssueText: ctx.resultMainIssueText,
    resultSummaryText: ctx.resultSummaryText,
    avoidAdviceTexts: ctx.avoidAdviceTexts,
    visibleOutcomeSource: ctx.visibleOutcomeSource,
    visibleOutcomeDisplays: ctx.visibleOutcomeDisplays,
    allOutcomeDisplays: computed(() => asArray(ctx.allOutcomeDisplays?.value)),
    actionAdviceGroups: computed(() => normalizeAdviceGroups(ctx.actionAdviceGroups?.value)),
    avoidAdviceGroups: computed(() => normalizeAdviceGroups(ctx.avoidAdviceGroups?.value)),
    resultPlantNameText: computed(() => String(ctx.result?.value?.plantName || '植物')),
    resultScientificNameText: computed(() =>
      String(ctx.result?.value?.scientificName || '学名未知')
    ),
    resultHealthStatusText: computed(() => String(ctx.result?.value?.healthStatusText || '待确认')),
    resultHealthClass: computed(() =>
      getHealthClass(String(ctx.result?.value?.healthStatusText || '待确认'))
    ),
    resultObservedSymptoms: computed(() => asArray(ctx.result?.value?.observedSymptoms)),
    popupPanelStyle: ctx.popupPanelStyle,
    isAccordionQuestion: question => Boolean(ctx.isAccordionQuestion?.(question)),
    isCareBehaviorWateringTimelineQuestion: question =>
      Boolean(ctx.isCareBehaviorWateringTimelineQuestion?.(question)),
    getQuestionId: question => String(ctx.getQuestionId?.(question) || ''),
    getQuestionTitle: question => String(ctx.getQuestionTitle?.(question) || ''),
    getQuestionHelpText: question => String(ctx.getQuestionHelpText?.(question) || ''),
    getOptionText: (question, option) => String(ctx.getOptionText?.(question, option) || ''),
    getOptionDescription: option => String(ctx.getOptionDescription?.(option) || ''),
    getCareBehaviorTimelineByQuestion: question =>
      asArray(ctx.getCareBehaviorTimelineByQuestion?.(question)),
    handleCareBehaviorTimelineChange: ctx.handleCareBehaviorTimelineChange,
    getQuestionOptionId: option => String(ctx.getQuestionOptionId?.(option) || ''),
    getExpandedQuestionOptionId: question =>
      String(ctx.getExpandedQuestionOptionId?.(question) || ''),
    handleQuestionAccordionChange: ctx.handleQuestionAccordionChange,
    isQuestionOptionExpanded: ctx.isQuestionOptionExpanded,
    isSelectedQuestionOption: (question, option) =>
      Boolean(ctx.isSelectedQuestionOption?.(question, option)),
    selectQuestionOption: ctx.selectQuestionOption,
    goPreviousQuestion: ctx.goPreviousQuestion,
    canProceedQuestionNow: ctx.canProceedQuestionNow,
    handleNextQuestion: ctx.handleNextQuestion,
    open: ctx.open,
    close: ctx.close,
    handleChange: ctx.handleChange,
    clearDevSymptomClass: ctx.clearDevSymptomClass,
    handleSymptomClassQuickSelect: ctx.handleSymptomClassQuickSelect,
    chooseImage: ctx.chooseImage,
    chooseAdditionalImage: ctx.chooseAdditionalImage,
    removeImage: ctx.removeImage,
    removeAdditionalImage: ctx.removeAdditionalImage,
    resetAdditionalImages: ctx.resetAdditionalImages,
    startDiagnose: ctx.startDiagnose,
    handleAIDialogClose: ctx.handleAIDialogClose,
    handleAIDialogCancel: ctx.handleAIDialogCancel,
    handleAIDialogConfirm: ctx.handleAIDialogConfirm,
    handleAIRetry: ctx.handleAIRetry,
    canStartDiagnose: ctx.canStartDiagnose,
    canStartDiagnoseNow: ctx.canStartDiagnoseNow,
    canSubmitQuestionAnswers: ctx.canSubmitQuestionAnswers,
    canSubmitAdditionalImages: ctx.canSubmitAdditionalImages,
    canSubmitAdditionalImagesNow: ctx.canSubmitAdditionalImagesNow,
    submitQuestionAnswers: ctx.submitQuestionAnswers,
    submitAdditionalImages: ctx.submitAdditionalImages,
    resetDiagnose: ctx.resetDiagnose,
    injectAutomationDiagnoseImagesFromStorage: ctx.injectAutomationDiagnoseImagesFromStorage,
    getOrganOptionLabel: value => String(ctx.getOrganOptionLabel?.(value) || ''),
    getVisibleCareBehaviorOptions: question =>
      asArray(ctx.getVisibleCareBehaviorOptions?.(question))
  }

  const viewContext = proxyRefs(viewModel)

  return {
    ...viewModel,
    viewContext
  }
}
