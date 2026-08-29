import { computed, proxyRefs, ref } from 'vue'
import { SYMPTOM_CLASS_QUICK_SELECT_OPTIONS } from '@/constants/diagnosis-intake.js'
import { requestDiagnosisQuestionStart, requestDiagnosisStart } from '@/api/diagnosis-start.js'
import { useCloudImageUploader } from '@/composables/useCloudImageUploader.js'
import { useUserStore } from '@/store/user.js'
import { ANALYTICS_EVENTS, reportAnalyticsEvent } from '@/utils/analytics.js'
import { createAsyncActionGuard } from '@/utils/interaction-guard.js'
import { DIAGNOSIS_IMAGE_UPLOAD_OPTIONS } from '@/utils/diagnosis-image-uploader-options.js'
import { buildStructuredImageInputs } from '@/utils/diagnose-structured-images.js'
import {
  PRIMARY_IMAGE_LIMIT,
  PRIMARY_SLOT_SEQUENCE,
  buildSlotGroups,
  buildSlotMetadata,
  getOrganOptionLabel,
  getSlotCapacity,
  getSlotFileCount,
  normalizeSlotType
} from '@/utils/diagnose-image-slots.js'
import { persistDiagnosisQuestionPackageDraft } from './diagnosis-intake-draft.js'

const NO_IMAGES = 0
const FIRST_IMAGE_INDEX = 0

function navigateToQuestionPackage(draftKey) {
  return new Promise((resolve, reject) => {
    uni.navigateTo({
      url: `/subpackages/diagnosis/question-package?draftKey=${encodeURIComponent(draftKey)}`,
      success: resolve,
      fail: reject
    })
  })
}

function showUploadError(error) {
  const message = String(error?.errMsg || error?.message || '')
  if (message.includes('cancel')) {
    return
  }
  uni.showToast({ title: '选择图片失败，请重试', icon: 'none' })
}

function buildStandaloneDiagnosisPayload(structuredImages, diagnosisProfile) {
  const imageIds = structuredImages.map(item => item.imageRef).filter(Boolean)

  return {
    userPlantId: null,
    image: imageIds[FIRST_IMAGE_INDEX] || '',
    images: structuredImages,
    imageIds,
    diagnosisProfile,
    entrySource: 'diagnose_tab',
    description: `共上传 ${structuredImages.length} 张照片`,
    clientContext: {
      source: 'diagnose_tab',
      platform: 'wechat-mini-program',
      reviewSourceType: 'manual',
      visualInputVersion: 'multi_image_contract_v1',
      structuredImageCount: structuredImages.length,
      diagnosisProfile,
      entrySource: 'diagnose_tab'
    }
  }
}

export function useDiagnosisTabIntake() {
  const userStore = useUserStore()
  const uploader = useCloudImageUploader({
    count: PRIMARY_IMAGE_LIMIT,
    ...DIAGNOSIS_IMAGE_UPLOAD_OPTIONS
  })
  const selectedDiagnosisProfile = ref('full')
  const selectedDevSymptomClassKey = ref('')
  const isStartingDiagnosis = ref(false)
  const startDiagnosisAction = createAsyncActionGuard()
  const imageFiles = uploader.files
  const selectedDevSymptomClassOption = computed(
    () =>
      SYMPTOM_CLASS_QUICK_SELECT_OPTIONS.find(
        item => item.classKey === selectedDevSymptomClassKey.value
      ) || null
  )
  const primarySlotGroups = computed(() =>
    buildSlotGroups(imageFiles.value, PRIMARY_SLOT_SEQUENCE, PRIMARY_IMAGE_LIMIT)
  )
  const canStartDiagnoseNow = computed(() => {
    if (
      isStartingDiagnosis.value ||
      uploader.hasPendingUploads.value ||
      uploader.hasUploadErrors.value
    ) {
      return false
    }
    if (selectedDiagnosisProfile.value === 'pest') {
      return imageFiles.value.length > NO_IMAGES
    }
    return imageFiles.value.length > NO_IMAGES || Boolean(selectedDevSymptomClassOption.value)
  })

  function setDiagnosisProfile(profile = 'full') {
    selectedDiagnosisProfile.value = profile === 'pest' ? 'pest' : 'full'
  }

  function clearDevSymptomClass() {
    selectedDevSymptomClassKey.value = ''
  }

  async function chooseImage(slotType = 'other') {
    const normalizedSlotType = normalizeSlotType(slotType, 'other')
    const slotLimit = getSlotCapacity(PRIMARY_IMAGE_LIMIT)
    if (imageFiles.value.length >= PRIMARY_IMAGE_LIMIT) {
      uni.showToast({ title: `最多上传 ${PRIMARY_IMAGE_LIMIT} 张`, icon: 'none' })
      return
    }
    if (getSlotFileCount(imageFiles.value, normalizedSlotType) >= slotLimit) {
      uni.showToast({
        title: `${getOrganOptionLabel(normalizedSlotType)}最多 ${slotLimit} 张`,
        icon: 'none'
      })
      return
    }

    try {
      await uploader.chooseAndUpload({
        maxAge: 7200,
        pickCount: 1,
        entryPatch: buildSlotMetadata(normalizedSlotType, imageFiles.value.length)
      })
    } catch (error) {
      showUploadError(error)
    }
  }

  async function removeImage(index) {
    await uploader.removeAt(index)
  }

  function validateStart() {
    if (uploader.hasPendingUploads.value) {
      uni.showToast({ title: '请等待图片上传完成', icon: 'none' })
      return false
    }
    if (uploader.hasUploadErrors.value) {
      uni.showToast({ title: '请先删除上传失败的图片', icon: 'none' })
      return false
    }
    if (selectedDiagnosisProfile.value === 'pest' && imageFiles.value.length === NO_IMAGES) {
      uni.showToast({ title: '只看虫害需要先上传照片', icon: 'none' })
      return false
    }
    if (imageFiles.value.length === NO_IMAGES && !selectedDevSymptomClassOption.value) {
      uni.showToast({ title: '请先添加照片', icon: 'none' })
      return false
    }
    return true
  }

  function startDiagnosis() {
    return startDiagnosisAction.run(async () => {
      if (isStartingDiagnosis.value || !validateStart()) {
        return false
      }

      isStartingDiagnosis.value = true
      uni.showLoading({ title: '正在准备问题...' })
      try {
        reportAnalyticsEvent(ANALYTICS_EVENTS.DIAGNOSE)
        const structuredImages = buildStructuredImageInputs(imageFiles.value)
        const selectedSymptom = selectedDevSymptomClassOption.value
        const diagnosisResult =
          structuredImages.length === NO_IMAGES
            ? await requestDiagnosisQuestionStart({
                symptomClassKey: selectedSymptom.classKey,
                symptomKey: selectedSymptom.symptomKey,
                diagnosisProfile: selectedDiagnosisProfile.value,
                entrySource: 'diagnose_tab',
                description: `无图症状模式：${selectedSymptom.symptomCn}（${selectedSymptom.classNameCn}）`,
                clientContext: {
                  source: 'diagnose_tab',
                  platform: 'wechat-mini-program',
                  reviewSourceType: 'manual_symptom_mode',
                  visualInputVersion: 'manual_symptom_mode_v1',
                  structuredImageCount: NO_IMAGES,
                  diagnosisProfile: selectedDiagnosisProfile.value,
                  entrySource: 'diagnose_tab'
                }
              })
            : await requestDiagnosisStart({
                ...buildStandaloneDiagnosisPayload(structuredImages, selectedDiagnosisProfile.value)
              })
        const draftKey = persistDiagnosisQuestionPackageDraft({
          diagnosisResult,
          images: imageFiles.value.map(item => item?.previewUrl).filter(Boolean)
        })
        userStore.useAIQuota()
        reportAnalyticsEvent(ANALYTICS_EVENTS.ENTER_DIAGNOSE_QUESTIONS)
        await navigateToQuestionPackage(draftKey)
        return true
      } catch {
        uni.showToast({ title: '暂时无法开始检查，请检查网络后重试', icon: 'none' })
        return false
      } finally {
        uni.hideLoading()
        isStartingDiagnosis.value = false
      }
    })
  }

  async function handleSymptomClassQuickSelect(option = null) {
    selectedDevSymptomClassKey.value = String(option?.classKey || '').trim()
    if (selectedDiagnosisProfile.value === 'pest') {
      uni.showToast({ title: '只看虫害需要先上传照片', icon: 'none' })
      return
    }
    if (imageFiles.value.length > NO_IMAGES) {
      return
    }
    await startDiagnosis()
  }

  return {
    intakeView: proxyRefs({
      result: null,
      SYMPTOM_CLASS_QUICK_SELECT_OPTIONS,
      selectedDevSymptomClassKey,
      selectedDevSymptomClassOption,
      selectedDiagnosisProfile,
      primarySlotGroups,
      imageFiles,
      PRIMARY_IMAGE_LIMIT,
      hasPendingUploads: uploader.hasPendingUploads,
      hasUploadErrors: uploader.hasUploadErrors,
      setDiagnosisProfile,
      handleSymptomClassQuickSelect,
      clearDevSymptomClass,
      chooseImage,
      removeImage
    }),
    canStartDiagnoseNow,
    isStartingDiagnosis,
    startDiagnosis
  }
}
