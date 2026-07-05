export { useUserStore } from '@/store/user.js'
export { useDiagnoseStore } from '@/store/diagnose.js'
export { useCloudImageUploader } from '@/composables/useCloudImageUploader'
export { useDiagnoseMutation } from '@/vue-query/diagnose/mutations/useDiagnoseMutation.js'
export { useDiagnosisQuestionStartMutation } from '@/vue-query/diagnose/mutations/useDiagnosisQuestionStartMutation.js'
export { useDiagnosisAnswerMutation } from '@/vue-query/diagnose/mutations/useDiagnosisAnswerMutation.js'
export { getEnvironmentWeatherWindow } from '@/api/weather.js'
export {
  normalizeDiagnosisResult,
  createQuestionAnswerMap,
  isQuestionAnswerComplete,
  buildQuestionAnswerPayload
} from '@/utils/diagnose-flow.js'
export { getQuestionIdentity as getQuestionId } from '@/utils/diagnose-question-identity.js'
export {
  extractCareBehaviorTimelineFromQuestion,
  getVisibleCareBehaviorOptions,
  hasMeaningfulCareBehaviorTimeline,
  isCareBehaviorTimelineSentinelAnswer,
  isSessionWateringTimelineQuestion,
  isCareBehaviorWateringTimelineQuestion,
  normalizeCareBehaviorTimeline,
  resolveCareBehaviorTimelineAutoAnswerOptionId,
  resolveCareBehaviorTimelineRecordedAnswerOptionId
} from '@/utils/care-behavior-timeline.js'
export { mergeEnvironmentWeatherWindowIntoCareBehaviorTimeline } from '@/utils/care-behavior-weather-window.js'
export {
  PRIMARY_IMAGE_LIMIT,
  ADDITIONAL_IMAGE_LIMIT,
  PRIMARY_SLOT_SEQUENCE,
  ADDITIONAL_IMAGE_SLOT_SEQUENCE,
  getOrganOptionLabel,
  normalizeSlotType,
  getSlotCapacity,
  getSlotFileCount,
  buildSlotGroups,
  buildSlotMetadata,
  inferAdditionalImageSlotTypeFromSuggestion
} from '@/utils/diagnose-image-slots.js'
