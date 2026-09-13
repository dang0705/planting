<template>
  <view id="watering-soil-evidence-stage" class="watering-soil-evidence-stage">
    <text class="watering-soil-evidence-title">拍一张盆土照片</text>
    <text class="watering-soil-evidence-subtitle">
      这一步只看盆土表面，用来避免在仍湿时误浇。
    </text>
    <DiagnoseIntake
      :view="intakeView"
      mode="soil-only"
      :soil-image="selectedImage"
      @soil-select="selectNewPhoto"
      @soil-replace="replacePhoto"
      @soil-remove="removePhoto"
    />
    <view
      v-if="analysisMessage"
      id="watering-soil-analysis-message"
      class="watering-soil-analysis-message"
    >
      <text>{{ analysisMessage }}</text>
    </view>
    <view
      v-if="needsManualConfirmation"
      id="watering-soil-manual-confirmation"
      class="watering-soil-manual-confirmation"
      @click="toggleManualConfirmation"
    >
      <view
        id="watering-soil-manual-confirmation-toggle"
        class="watering-soil-confirm-mark"
        :class="{ 'watering-soil-confirm-mark--active': manualConfirmed }"
      >
        <text v-if="manualConfirmed">✓</text>
      </view>
      <text>我已用手摸入约 2–3 厘米确认盆土状态</text>
    </view>
    <button
      v-if="showContinue"
      id="watering-soil-continue-button"
      class="watering-soil-continue-button"
      :class="{ 'watering-soil-continue-button--disabled': !canContinue || loading }"
      :disabled="!canContinue || loading"
      @click="continueWithEvidence"
    >
      {{ loading ? '正在检查盆土…' : '继续查看建议' }}
    </button>
  </view>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import DiagnoseIntake from '@/components/diagnosis/DiagnoseIntake.vue'
import { useCloudImageUploader } from '@/composables/useCloudImageUploader.js'
import {
  registerDiagnoseImageAsPlantImage,
  requestDiagnoseImageDelete,
  requestStorageFileDelete
} from '@/http-functions/storage/client.js'
import {
  analyzeWateringSoilEvidence,
  cleanupTemporaryWateringSoilEvidence
} from '@/http-functions/diagnose/watering-soil.js'

const props = defineProps({
  plantId: { type: [String, Number], default: null },
  autoReuseDiagnosis: { type: Boolean, default: true },
  showContinue: { type: Boolean, default: true }
})
const emit = defineEmits(['ready', 'change'])

const selectedImage = ref(null)
const evidence = ref(null)
const loading = ref(false)
const manualConfirmed = ref(false)
const analysisMessage = ref('')
const uploader = useCloudImageUploader({
  count: 1,
  size: 5,
  maxImagePixels: 1280 * 1280
})

const hasPlant = computed(() => Number(props.plantId) > 0)
const needsManualConfirmation = computed(() => {
  if (!evidence.value) {
    return false
  }
  const review = evidence.value.review || {}
  return !(review.surfaceState === 'wet' || review.standingWater === 'yes')
})
const canContinue = computed(
  () => Boolean(evidence.value?.evidenceId) && (!needsManualConfirmation.value || manualConfirmed.value)
)
const intakeView = computed(() => ({
  result: null,
  imageFiles: [],
  primarySlotGroups: [],
  chooseImage: selectNewPhoto,
  removeImage: removePhoto
}))

function emitChange() {
  emit('change', {
    evidenceId: evidence.value?.evidenceId || '',
    manualSoilConfirmed: manualConfirmed.value === true,
    canContinue: canContinue.value
  })
}

function presentEvidence(result, image) {
  evidence.value = result || null
  selectedImage.value = image
  manualConfirmed.value = false
  analysisMessage.value = String(result?.message || '').trim()
  emitChange()
}

async function inspectUploadedImage(uploaded) {
  const source = hasPlant.value ? 'plant_image' : 'temporary'
  const result = await analyzeWateringSoilEvidence({
    source,
    plantId: hasPlant.value ? Number(props.plantId) : undefined,
    fileId: uploaded.fileId
  })
  presentEvidence(result, {
    previewUrl: uploaded.tempUrl || uploaded.url || '',
    fileId: uploaded.fileId,
    source,
    sourceLabel: '本次拍摄的盆土图',
    uploaded
  })
}

async function selectNewPhoto() {
  if (loading.value) {
    return
  }
  loading.value = true
  analysisMessage.value = ''
  let uploaded = null
  let imageRegistered = false
  try {
    const entries = await uploader.chooseAndUpload({
      plantId: hasPlant.value ? String(props.plantId) : 'temp',
      maxAge: 7200
    })
    uploaded = entries.find(entry => entry.status === 'success')?.uploaded
    if (!uploaded?.fileId) {
      analysisMessage.value = '照片上传失败，请重试。'
      uploader.files.value = []
      return
    }
    await registerDiagnoseImageAsPlantImage({
      plantId: hasPlant.value ? String(props.plantId) : 'temp',
      fileId: uploaded.fileId,
      cloudPath: uploaded.cloudPath || ''
    })
    imageRegistered = true
    await inspectUploadedImage(uploaded)
  } catch (error) {
    analysisMessage.value = error?.message || '盆土照片暂时无法分析，请重试。'
    // 独立顾问的照片只服务当前一次分析：若登记或视觉分析失败，也要立即
    // 清理已上传的原图，不能等到页面卸载时留下孤儿文件。
    if (!hasPlant.value && uploaded?.fileId) {
      cleanupTemporaryWateringSoilEvidence(evidence.value?.evidenceId || '').catch(() => {})
      const remove = imageRegistered ? requestStorageFileDelete : requestDiagnoseImageDelete
      remove({ fileId: uploaded.fileId }).catch(() => {})
      uploader.files.value = []
    }
  } finally {
    loading.value = false
  }
}

async function removePhoto() {
  const image = selectedImage.value
  const currentEvidenceId = evidence.value?.evidenceId || ''
  selectedImage.value = null
  evidence.value = null
  manualConfirmed.value = false
  analysisMessage.value = ''
  emitChange()
  if (!image?.fileId || image.source === 'recent_diagnosis') {
    uploader.files.value = []
    return
  }
  try {
    if (!hasPlant.value) {
      await cleanupTemporaryWateringSoilEvidence(currentEvidenceId)
    }
    await requestStorageFileDelete({ fileId: image.fileId })
  } catch {
    // 用户的下一步不依赖历史图片删除；失败不会把内部错误展示到界面。
  } finally {
    uploader.files.value = []
  }
}

async function replacePhoto() {
  await removePhoto()
  await selectNewPhoto()
}

function toggleManualConfirmation() {
  manualConfirmed.value = !manualConfirmed.value
  emitChange()
}

function continueWithEvidence() {
  if (!canContinue.value || loading.value) {
    return
  }
  emit('ready', {
    evidenceId: evidence.value.evidenceId,
    manualSoilConfirmed: manualConfirmed.value === true,
    review: evidence.value.review || null
  })
}

async function tryReuseDiagnosisPhoto() {
  if (!hasPlant.value || !props.autoReuseDiagnosis) {
    return
  }
  loading.value = true
  try {
    const result = await analyzeWateringSoilEvidence({
      source: 'recent_diagnosis',
      plantId: Number(props.plantId)
    })
    if (!result?.reusable || !result?.evidenceId) {
      return
    }
    presentEvidence(result, {
      previewUrl: result.previewUrl || '',
      source: 'recent_diagnosis',
      sourceLabel: result.sourceLabel || '使用最近诊断盆土图'
    })
  } catch {
    // 无可复用图、已过期或临时链接失效时统一回到新拍入口。
  } finally {
    loading.value = false
  }
}

onMounted(tryReuseDiagnosisPhoto)
onBeforeUnmount(() => {
  if (!hasPlant.value && selectedImage.value?.fileId) {
    cleanupTemporaryWateringSoilEvidence(evidence.value?.evidenceId || '').catch(() => {})
    requestStorageFileDelete({ fileId: selectedImage.value.fileId }).catch(() => {})
  }
})

defineExpose({ tryReuseDiagnosisPhoto, removePhoto, continueWithEvidence })
</script>

<style scoped>
.watering-soil-evidence-stage {
  padding: 8px 16px 20px;
}
.watering-soil-evidence-title {
  display: block;
  color: #1f2933;
  font-size: 21px;
  font-weight: 700;
  line-height: 30px;
}
.watering-soil-evidence-subtitle {
  display: block;
  margin-top: 4px;
  color: #667085;
  font-size: 13px;
  line-height: 20px;
}
.watering-soil-analysis-message {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  background: #fff8eb;
  color: #8a6046;
  font-size: 12px;
  line-height: 18px;
}
.watering-soil-manual-confirmation {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  margin-top: 14px;
  padding: 12px;
  border: 1px solid #d6e6da;
  border-radius: 14px;
  color: #375548;
  font-size: 13px;
  line-height: 20px;
}
.watering-soil-confirm-mark {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  margin-top: 1px;
  border: 1px solid #8aae97;
  border-radius: 5px;
  color: #fff;
  font-size: 12px;
}
.watering-soil-confirm-mark--active {
  border-color: #2d7a4f;
  background: #2d7a4f;
}
.watering-soil-continue-button {
  width: 100%;
  margin-top: 18px;
  border-radius: 14px;
  background: #2d7a4f;
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  line-height: 48px;
}
.watering-soil-continue-button--disabled {
  background: #bac7bd;
}
</style>
