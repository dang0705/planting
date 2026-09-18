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
    <button
      v-if="showAnalysisConfirm && hasPendingPhoto && !analysisStarted"
      id="watering-soil-confirm-analysis-button"
      class="watering-soil-analysis-button"
      :disabled="uploading"
      @click="startPhotoAnalysis"
    >
      确认并开始分析
    </button>
    <button
      v-else-if="analysisStarted && !evidence && !analyzing"
      id="watering-soil-retry-analysis-button"
      class="watering-soil-analysis-button"
      @click="startPhotoAnalysis"
    >
      重新分析这张照片
    </button>
    <view
      v-if="analysisMessage"
      id="watering-soil-analysis-message"
      class="watering-soil-analysis-message"
    >
      <text>{{ analysisMessage }}</text>
    </view>
    <WateringSoilVisualDecision
      v-if="visualDecision.resultText"
      :result-text="visualDecision.resultText"
      :action-text="visualDecision.actionText"
    />
    <WateringSoilInteriorCheck
      v-if="needsInteriorCheck"
      :environment-weather-window="props.environmentWeatherWindow"
      @change="handleInteriorCheckChange"
    />
    <view
      v-if="interiorValidationMessage"
      id="watering-soil-interior-validation"
      class="watering-soil-interior-validation"
    >
      <text>{{ interiorValidationMessage }}</text>
    </view>
    <view v-if="showContinue && hasVisualResult && !loading" class="watering-soil-continue-dock">
      <button
        id="watering-soil-continue-button"
        class="watering-soil-continue-button"
        :disabled="!canContinue"
        @click="continueWithEvidence"
      >
        继续查看建议
      </button>
    </view>
  </view>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import DiagnoseIntake from '@/components/diagnosis/DiagnoseIntake.vue'
import WateringSoilInteriorCheck from './WateringSoilInteriorCheck.vue'
import WateringSoilVisualDecision from './WateringSoilVisualDecision.vue'
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
  showContinue: { type: Boolean, default: true },
  showAnalysisConfirm: { type: Boolean, default: true },
  enableInteriorCheck: { type: Boolean, default: false },
  environmentWeatherWindow: { type: Object, default: null },
  continueRequest: { type: Number, default: 0 }
})
const emit = defineEmits(['ready', 'change'])

const selectedImage = ref(null)
const evidence = ref(null)
const uploading = ref(false)
const analyzing = ref(false)
const analysisStarted = ref(false)
const manualConfirmed = ref(false)
const interiorCheck = ref({ mode: '', interiorState: '', wateringEvents: [] })
const analysisMessage = ref('')
const visualScanText = ref('正在检查照片...')
let visualScanTimer = null
const visualScanTexts = ['正在检查照片...', '正在识别盆土表面...', '正在整理分析结果...']
const temporaryEvidenceHandedOff = ref(false)
// 点击“继续”后，父页面会立即发起最终建议请求；同一张临时图只能交给该请求一次。
// 否则双击会产生两个并发规划请求，先完成的请求清理临时证据，后完成的请求便会误报“已过期”。
const evidenceSubmitting = ref(false)
const uploader = useCloudImageUploader({
  count: 1,
  size: 5,
  maxImagePixels: 1280 * 1280
})

const hasPlant = computed(() => Number(props.plantId) > 0)
const loading = computed(() => uploading.value || analyzing.value)
const hasPendingPhoto = computed(() => Boolean(selectedImage.value?.fileId) && !evidence.value)
const hasVisualResult = computed(() => Boolean(evidence.value?.evidenceId))
const visualDecision = computed(() => {
  const review = evidence.value?.review || {}
  if (!evidence.value?.evidenceId) {
    return { resultText: '', actionText: '' }
  }
  if (review.surfaceState === 'wet' || review.standingWater === 'yes') {
    return {
      resultText: '模型判断土表潮湿。',
      actionText: '本次先不要浇水；继续查看水量前会再次确认。'
    }
  }
  if (review.surfaceState === 'dry') {
    return {
      resultText: '模型判断土表明显干燥。',
      actionText: '已按干燥处理，建议尽快浇水。'
    }
  }
  if (review.surfaceState === 'moist') {
    return {
      resultText: '模型判断土表略湿。',
      actionText: '请选择一种方式确认盆土里面的状态。'
    }
  }
  return {
    resultText: '模型暂时无法清楚判断盆土状态。',
    actionText: '请重新拍摄，或确认盆土里面的状态后再继续。'
  }
})
const needsInteriorCheck = computed(() => {
  if (!evidence.value) {
    return false
  }
  const review = evidence.value.review || {}
  return (
    props.enableInteriorCheck &&
    review.surfaceState !== 'wet' &&
    review.standingWater !== 'yes' &&
    review.surfaceState !== 'dry'
  )
})
function resolveInteriorCheckCanContinue() {
  if (!needsInteriorCheck.value) {
    return true
  }
  const mode = interiorCheck.value.mode
  if (mode === 'manual') {
    return ['wet', 'moist', 'dry'].includes(interiorCheck.value.interiorState)
  }
  if (mode === 'history') {
    return interiorCheck.value.wateringEvents.length > 0
  }
  return mode === 'skip'
}
const interiorValidationMessage = computed(() => {
  if (!needsInteriorCheck.value || !evidence.value?.evidenceId) {
    return ''
  }
  const mode = interiorCheck.value.mode
  if (mode === 'manual' && !interiorCheck.value.interiorState) {
    return '请选择盆土状态后再继续。'
  }
  if (mode === 'history' && interiorCheck.value.wateringEvents.length === 0) {
    return '请选择至少一个浇水日期后再继续。'
  }
  if (!mode) {
    return '请选择一种确认方式；跳过以上操作后可继续。'
  }
  return ''
})
const canContinue = computed(
  () => Boolean(evidence.value?.evidenceId) && resolveInteriorCheckCanContinue()
)
const intakeView = computed(() => ({
  result: null,
  imageFiles: [],
  primarySlotGroups: [],
  isVisualScanning: analyzing.value,
  soilUploadLoading: uploading.value,
  soilLocked: analysisStarted.value,
  visualScanText: visualScanText.value,
  chooseImage: selectNewPhoto,
  removeImage: removePhoto
}))

function startVisualScan() {
  let index = 0
  visualScanText.value = visualScanTexts[index]
  clearInterval(visualScanTimer)
  visualScanTimer = setInterval(() => {
    index = (index + 1) % visualScanTexts.length
    visualScanText.value = visualScanTexts[index]
  }, 1800)
}

function stopVisualScan() {
  clearInterval(visualScanTimer)
  visualScanTimer = null
}

function emitChange() {
  emit('change', {
    evidenceId: evidence.value?.evidenceId || '',
    manualSoilConfirmed: manualConfirmed.value === true,
    canContinue: canContinue.value,
    awaitingAnalysis: hasPendingPhoto.value && !analysisStarted.value
  })
}

function resolveSoilMoistureOverride() {
  const review = evidence.value?.review || {}
  if (review.surfaceState === 'dry') {
    return 'dry'
  }
  if (!needsInteriorCheck.value) {
    return ''
  }
  if (interiorCheck.value.mode === 'skip') {
    return 'dry'
  }
  if (interiorCheck.value.mode === 'manual') {
    return interiorCheck.value.interiorState || ''
  }
  return ''
}

function handleInteriorCheckChange(value) {
  interiorCheck.value = value || { mode: '', interiorState: '', wateringEvents: [] }
  manualConfirmed.value =
    interiorCheck.value.mode === 'manual' && Boolean(interiorCheck.value.interiorState)
  emitChange()
}

function presentEvidence(result, image) {
  evidence.value = result || null
  selectedImage.value = image
  analysisStarted.value = true
  manualConfirmed.value = false
  interiorCheck.value = { mode: '', interiorState: '', wateringEvents: [] }
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
    previewUrl: result?.previewUrl || uploaded.tempUrl || uploaded.url || '',
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
  uploading.value = true
  analysisMessage.value = ''
  let uploaded = null
  let imageRegistered = false
  try {
    const entries = await uploader.chooseAndUpload({
      plantId: hasPlant.value ? String(props.plantId) : 'temp',
      maxAge: 7200,
      resolveTempUrl: true
    })
    uploaded = entries.find(entry => entry.status === 'success')?.uploaded
    if (!uploaded?.fileId) {
      analysisMessage.value = '照片上传失败，请重试。'
      uploader.files.value = []
      return
    }
    const registered = await registerDiagnoseImageAsPlantImage({
      plantId: hasPlant.value ? String(props.plantId) : 'temp',
      fileId: uploaded.fileId,
      cloudPath: uploaded.cloudPath || ''
    })
    imageRegistered = true
    selectedImage.value = {
      previewUrl: uploaded.tempUrl || uploaded.url || '',
      fileId: uploaded.fileId,
      source: hasPlant.value ? 'plant_image' : 'temporary',
      sourceLabel: '本次拍摄的盆土图',
      uploaded: { ...uploaded, ...registered }
    }
    evidence.value = null
    analysisStarted.value = false
    analysisMessage.value = '照片已上传，请确认后开始分析。'
    emitChange()
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
    uploading.value = false
  }
}

async function startPhotoAnalysis() {
  if (!selectedImage.value?.fileId || analyzing.value || evidence.value) {
    return
  }
  analysisStarted.value = true
  emitChange()
  analyzing.value = true
  startVisualScan()
  analysisMessage.value = ''
  try {
    await inspectUploadedImage(selectedImage.value.uploaded || selectedImage.value)
  } catch (error) {
    analysisMessage.value = error?.message || '盆土照片暂时无法分析，请重试。'
  } finally {
    analyzing.value = false
    stopVisualScan()
  }
}

async function removePhoto() {
  const image = selectedImage.value
  const currentEvidenceId = evidence.value?.evidenceId || ''
  selectedImage.value = null
  evidence.value = null
  analysisStarted.value = false
  manualConfirmed.value = false
  interiorCheck.value = { mode: '', interiorState: '', wateringEvents: [] }
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

function continueWithEvidence() {
  if (!canContinue.value || loading.value || evidenceSubmitting.value) {
    return
  }
  evidenceSubmitting.value = true
  // 独立浇水进入下一步后，服务端规划接口会在完成或失败时清理临时原图和
  // 证据。不能让本组件因 v-if 卸载抢先删除它们，否则规划会读到已过期证据。
  temporaryEvidenceHandedOff.value = !hasPlant.value
  emit('ready', {
    evidenceId: evidence.value.evidenceId,
    manualSoilConfirmed: manualConfirmed.value === true,
    soilMoistureOverride: resolveSoilMoistureOverride(),
    wateringEvents: Array.isArray(interiorCheck.value.wateringEvents)
      ? interiorCheck.value.wateringEvents
      : [],
    hasWateringHistoryInput: interiorCheck.value.mode === 'history',
    review: evidence.value.review || null,
    temporaryFileId: hasPlant.value ? '' : selectedImage.value?.fileId || ''
  })
}

watch(
  () => props.continueRequest,
  (request, previousRequest) => {
    if (request === previousRequest) {
      return
    }
    continueWithEvidence()
  }
)

// 父层的最终规划请求可能因网络、参数或平台会话失败而退回本步骤。
// 这时必须释放“一次性交接”锁，否则用户修正后再次点击会被静默拦截。
function resetSubmissionGuard() {
  evidenceSubmitting.value = false
}

async function tryReuseDiagnosisPhoto() {
  if (!hasPlant.value || !props.autoReuseDiagnosis) {
    return
  }
  analyzing.value = true
  startVisualScan()
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
    analyzing.value = false
    stopVisualScan()
  }
}

onMounted(tryReuseDiagnosisPhoto)
onBeforeUnmount(stopVisualScan)
onBeforeUnmount(() => {
  if (!hasPlant.value && !temporaryEvidenceHandedOff.value && selectedImage.value?.fileId) {
    cleanupTemporaryWateringSoilEvidence(evidence.value?.evidenceId || '').catch(() => {})
    requestStorageFileDelete({ fileId: selectedImage.value.fileId }).catch(() => {})
  }
})

defineExpose({
  tryReuseDiagnosisPhoto,
  removePhoto,
  continueWithEvidence,
  resetSubmissionGuard,
  startPhotoAnalysis
})
</script>

<style scoped>
.watering-soil-evidence-stage {
  padding: 8px 16px 96px;
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
.watering-soil-analysis-button {
  width: 100%;
  margin-top: 12px;
  border-radius: 12px;
  background: #2d7a4f;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  line-height: 44px;
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
.watering-soil-interior-validation {
  margin-top: 8px;
  color: #8a6046;
  font-size: 12px;
  line-height: 18px;
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
.watering-soil-continue-dock {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 2;
  margin: 0;
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
  background: linear-gradient(180deg, rgba(248, 250, 249, 0) 0%, #f8faf9 24%);
}
</style>
