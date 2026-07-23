/* oxlint-disable no-magic-numbers */
import { ref } from 'vue'
import {
  ADDITIONAL_IMAGE_LIMIT,
  PRIMARY_IMAGE_LIMIT,
  useCloudImageUploader,
  useDiagnoseMutation,
  useDiagnoseStore,
  useDiagnosisAnswerMutation,
  useDiagnosisQuestionStartMutation,
  useUserStore
} from './deps.js'
import { DIAGNOSIS_IMAGE_UPLOAD_OPTIONS } from './image-uploader-options'

export function createDiagnoseFlowState() {
  const userStore = useUserStore()
  const diagnoseStore = useDiagnoseStore()
  const popup = ref(null)
  const result = ref(null)
  const showAIDialog = ref(false)
  const aiStreamDialogRef = ref(null)
  const pendingDiagnosePayload = ref(null)
  const casePreviewImages = ref([])
  const questionAnswers = ref({})
  const careBehaviorTimelineByQuestionId = ref({})
  const environmentWeatherWindow = ref(null)
  const environmentWeatherWindowRequestKey = ref('')
  const environmentWeatherWindowLoading = ref(false)
  const questionStack = ref([])
  const activeQuestionIndex = ref(0)
  const committedQuestionAnswers = ref({})
  const dirtyQuestionFromIndex = ref(-1)
  const questionAnswerRevision = ref(0)
  const expandedQuestionOptionByQuestion = ref({})
  const submittingQuestionMode = ref('')
  const retakeAuthorizationPending = ref(false)
  const currentNow = ref(Date.now())
  const retakeAuthorizationReceivedClientAt = ref(0)
  const retakeNow = currentNow
  const riskConsentByQuestionId = ref({})
  const viewportHeight = ref(0)
  const tabBarOccupiedHeight = ref(50)
  const questionSwiperCurrent = ref(0)
  const questionSwiperPages = ref([null, null])
  const diagnoseMutation = useDiagnoseMutation()
  const questionStartMutation = useDiagnosisQuestionStartMutation()
  const diagnosisAnswerMutation = useDiagnosisAnswerMutation()
  const uploader = useCloudImageUploader({
    count: PRIMARY_IMAGE_LIMIT,
    ...DIAGNOSIS_IMAGE_UPLOAD_OPTIONS
  })
  const additionalImageUploader = useCloudImageUploader({
    count: ADDITIONAL_IMAGE_LIMIT,
    ...DIAGNOSIS_IMAGE_UPLOAD_OPTIONS
  })
  const imageFiles = uploader.files
  const hasPendingUploads = uploader.hasPendingUploads
  const hasUploadErrors = uploader.hasUploadErrors
  const additionalImageFiles = additionalImageUploader.files
  const hasPendingAdditionalImageUploads = additionalImageUploader.hasPendingUploads
  const hasAdditionalImageUploadErrors = additionalImageUploader.hasUploadErrors
  const runtimeEnv = import.meta.env || {}
  const isLocalDevelopmentBuild = Boolean(runtimeEnv.DEV) || runtimeEnv.MODE === 'development'
  const automationEnabled =
    runtimeEnv.VITE_APP_ENV === 'development' ||
    (!runtimeEnv.PROD && runtimeEnv.VITE_APP_ENV !== 'production')
  return {
    userStore,
    diagnoseStore,
    popup,
    result,
    showAIDialog,
    aiStreamDialogRef,
    pendingDiagnosePayload,
    casePreviewImages,
    questionAnswers,
    careBehaviorTimelineByQuestionId,
    environmentWeatherWindow,
    environmentWeatherWindowRequestKey,
    environmentWeatherWindowLoading,
    questionStack,
    activeQuestionIndex,
    committedQuestionAnswers,
    dirtyQuestionFromIndex,
    questionAnswerRevision,
    expandedQuestionOptionByQuestion,
    submittingQuestionMode,
    retakeAuthorizationPending,
    retakeNow,
    currentNow,
    retakeAuthorizationReceivedClientAt,
    riskConsentByQuestionId,
    viewportHeight,
    tabBarOccupiedHeight,
    questionSwiperCurrent,
    questionSwiperPages,
    diagnoseMutation,
    questionStartMutation,
    diagnosisAnswerMutation,
    uploader,
    additionalImageUploader,
    imageFiles,
    hasPendingUploads,
    hasUploadErrors,
    additionalImageFiles,
    hasPendingAdditionalImageUploads,
    hasAdditionalImageUploadErrors,
    runtimeEnv,
    isLocalDevelopmentBuild,
    automationEnabled
  }
}
