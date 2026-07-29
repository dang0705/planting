import { computed, onMounted, onUnmounted, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useCloudImageUploader } from '@/composables/useCloudImageUploader.js'
import { requestDiagnosisResult } from '@/http-functions/diagnose/client.js'
import {
  requestDiagnosisRetakeAuthorize,
  requestDiagnosisRetakeSkip
} from '@/http-functions/diagnose/retake.js'
import { buildSlotMetadata } from '@/utils/diagnose-image-slots.js'
import { normalizeDiagnosisResult } from '@/utils/diagnose-flow.js'
import { DIAGNOSIS_IMAGE_UPLOAD_OPTIONS } from '@/components/diagnose-flow/image-uploader-options.js'
import {
  buildAuthorizedRetakeResult,
  buildRetakeImageAnswerPayload,
  preserveDiagnosisContinuationContext,
  resolveRetakeUploadSlotType
} from '@/components/diagnose-flow/retake-continuation.js'
import {
  formatRetakeCountdownText,
  getRetakeRemainingSeconds,
  isRetakeSkippedUnknown
} from '@/components/diagnose-flow/retake-clock.js'
import { buildRetakeConfirmationContent } from '@/components/diagnose-flow/retake-copy.js'
import { isRetakeWindowExpiredError } from '@/components/diagnose-flow/retake-expiry.js'
import { buildStructuredImageInputs } from '@/components/diagnose-flow/structured-images.js'

const RETAKE_IMAGE_LIMIT = 1
const RETAKE_TIMER_INTERVAL_MS = 1000

function uniqueStrings(values = []) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : []).map(item => String(item || '').trim()).filter(Boolean)
    )
  )
}

function confirmRetakeStart(retakeRequest = {}) {
  return new Promise(resolve => {
    uni.showModal({
      title: '确认开始补拍',
      content: buildRetakeConfirmationContent(retakeRequest),
      confirmText: retakeRequest?.confirmButtonText || '确认开始',
      cancelText: '暂不补拍',
      success: modalResult => resolve(Boolean(modalResult?.confirm)),
      fail: () => resolve(false)
    })
  })
}

export function useQuestionPackageRetake({
  result,
  payload,
  images,
  plantName,
  diagnoseStore,
  diagnosisAnswerMutation,
  resetQuestionState
}) {
  const uploader = useCloudImageUploader({
    count: RETAKE_IMAGE_LIMIT,
    ...DIAGNOSIS_IMAGE_UPLOAD_OPTIONS
  })
  const currentNow = ref(Date.now())
  const retakeAuthorizationReceivedClientAt = ref(0)
  const retakeAuthorizationPending = ref(false)
  const isSubmittingImage = ref(false)
  let retakeTimer = null

  const retakeRequest = computed(() => result.value?.retakeRequest || null)
  const retakeAuthorizationState = computed(() => result.value?.retakeAuthorizationState || null)
  const retakeRemainingSeconds = computed(() =>
    getRetakeRemainingSeconds({
      retakeExpiresAt: retakeAuthorizationState.value?.retakeExpiresAt,
      serverNow: retakeAuthorizationState.value?.serverNow,
      receivedClientAt: retakeAuthorizationReceivedClientAt.value,
      currentNow: currentNow.value
    })
  )
  const retakeExpired = computed(() =>
    Boolean(retakeAuthorizationState.value && retakeRemainingSeconds.value <= 0)
  )
  const hasActiveRetakeAuthorization = computed(
    () => retakeAuthorizationState.value?.status === 'active' && !retakeExpired.value
  )
  const retakeCountdownText = computed(() =>
    formatRetakeCountdownText({
      authorization: retakeAuthorizationState.value,
      expired: retakeExpired.value,
      total: retakeRemainingSeconds.value
    })
  )
  const showRestartAction = computed(
    () =>
      retakeExpired.value ||
      isRetakeSkippedUnknown(retakeRequest.value, retakeAuthorizationState.value)
  )
  const canChooseImage = computed(
    () => hasActiveRetakeAuthorization.value && uploader.files.value.length < RETAKE_IMAGE_LIMIT
  )
  const canSubmitImage = computed(
    () =>
      hasActiveRetakeAuthorization.value &&
      uploader.files.value.length > 0 &&
      !uploader.hasPendingUploads.value &&
      !uploader.hasUploadErrors.value &&
      !isSubmittingImage.value
  )

  function applyDiagnosisResult(rawResult, previewImages = images.value, recordHistory = true) {
    const nextResult = preserveDiagnosisContinuationContext(
      normalizeDiagnosisResult(rawResult, {
        images: previewImages,
        plantName: plantName.value || result.value?.plantName || '植物'
      }),
      result.value,
      payload.value
    )
    result.value = nextResult
    resetQuestionState(nextResult?.questions || [])
    if (recordHistory) {
      diagnoseStore.addToHistory({
        images: previewImages,
        diagnosis: nextResult,
        diagnosisId: nextResult.diagnosisSessionId || ''
      })
    }
    return nextResult
  }

  async function beginRetakeAuthorization() {
    if (!retakeRequest.value || retakeAuthorizationPending.value) {
      return
    }
    retakeAuthorizationPending.value = true
    try {
      if (!(await confirmRetakeStart(retakeRequest.value))) {
        return
      }
      const authorization = await requestDiagnosisRetakeAuthorize({
        diagnosisSessionId: result.value?.diagnosisSessionId,
        requestedCaptureRegion: retakeRequest.value?.requestedCaptureRegion
      })
      currentNow.value = Date.now()
      retakeAuthorizationReceivedClientAt.value = currentNow.value
      result.value = buildAuthorizedRetakeResult(result.value, authorization)
    } catch (error) {
      uni.showToast({ title: error?.message || '开始补拍失败', icon: 'none' })
    } finally {
      retakeAuthorizationPending.value = false
    }
  }

  async function skipRetakeRequest() {
    if (!retakeRequest.value) {
      return
    }
    try {
      const skippedResult = await requestDiagnosisRetakeSkip({
        diagnosisSessionId: result.value?.diagnosisSessionId,
        requestedCaptureRegion: retakeRequest.value?.requestedCaptureRegion
      })
      currentNow.value = Date.now()
      retakeAuthorizationReceivedClientAt.value = 0
      applyDiagnosisResult(skippedResult)
      uni.showToast({ title: '已跳过补拍', icon: 'none' })
    } catch (error) {
      uni.showToast({ title: error?.message || '跳过补拍失败，请重试', icon: 'none' })
    }
  }

  async function chooseRetakeImage() {
    if (!canChooseImage.value) {
      return
    }
    const requestedCaptureRegion = String(retakeRequest.value?.requestedCaptureRegion || '').trim()
    const slotType = resolveRetakeUploadSlotType(requestedCaptureRegion)
    try {
      await uploader.chooseAndUpload({
        plantId: payload.value?.plantId || result.value?.plantId || '',
        maxAge: 7200,
        pickCount: RETAKE_IMAGE_LIMIT,
        entryPatch: {
          ...buildSlotMetadata(slotType, 0),
          ...(requestedCaptureRegion ? { captureRegion: requestedCaptureRegion } : {})
        }
      })
    } catch (error) {
      if (!String(error?.errMsg || error?.message || '').includes('cancel')) {
        uni.showToast({ title: '选择补拍照片失败，请重试', icon: 'none' })
      }
    }
  }

  async function refreshExpiredResult() {
    const sessionId = String(result.value?.diagnosisSessionId || '').trim()
    if (!sessionId) {
      return
    }
    const latest = await requestDiagnosisResult({ id: sessionId })
    currentNow.value = Date.now()
    retakeAuthorizationReceivedClientAt.value = 0
    applyDiagnosisResult(latest, images.value, false)
  }

  async function submitRetakeImage() {
    if (!canSubmitImage.value) {
      return
    }
    if (retakeExpired.value) {
      uni.showToast({ title: '补拍时间已结束', icon: 'none' })
      return
    }
    isSubmittingImage.value = true
    try {
      const rerunResult = await diagnosisAnswerMutation.mutateAsync(
        buildRetakeImageAnswerPayload({
          result: result.value,
          structuredImages: buildStructuredImageInputs(uploader.files.value)
        })
      )
      const nextPreviewImages = uniqueStrings([
        ...images.value,
        ...uploader.files.value.map(item => item?.previewUrl)
      ])
      images.value = nextPreviewImages
      applyDiagnosisResult(rerunResult, nextPreviewImages)
      await uploader.reset()
      uni.showToast({ title: '补拍已提交', icon: 'success' })
    } catch (error) {
      if (isRetakeWindowExpiredError(error)) {
        await refreshExpiredResult()
        uni.showToast({ title: '补拍时间已结束，本次诊断已结束', icon: 'none' })
        return
      }
      uni.showToast({ title: error?.message || '补拍提交失败，请重试', icon: 'none' })
    } finally {
      isSubmittingImage.value = false
    }
  }

  async function refreshActiveSessionFromService() {
    if (!retakeAuthorizationState.value || !result.value?.diagnosisSessionId) {
      return
    }
    try {
      await refreshExpiredResult()
      retakeAuthorizationReceivedClientAt.value = currentNow.value
    } catch (error) {
      console.warn('刷新补拍会话状态失败:', error)
    }
  }

  onMounted(() => {
    currentNow.value = Date.now()
    retakeTimer = setInterval(() => {
      currentNow.value = Date.now()
    }, RETAKE_TIMER_INTERVAL_MS)
  })
  onUnmounted(() => {
    if (retakeTimer) {
      clearInterval(retakeTimer)
    }
  })
  onShow(() => {
    currentNow.value = Date.now()
    refreshActiveSessionFromService()
  })

  return {
    retakeRequest,
    retakeAuthorizationState,
    retakeCountdownText,
    retakeExpired,
    hasActiveRetakeAuthorization,
    retakeFiles: uploader.files,
    canChooseRetakeImage: canChooseImage,
    canSubmitRetakeImage: canSubmitImage,
    isSubmittingRetakeImage: isSubmittingImage,
    showRetakeRestartAction: showRestartAction,
    beginRetakeAuthorization,
    skipRetakeRequest,
    chooseRetakeImage,
    removeRetakeImage: uploader.removeAt,
    submitRetakeImage
  }
}
