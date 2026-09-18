<template>
  <view v-if="!result" id="diagnose-upload-stage">
    <view v-if="soilOnly" id="watering-soil-intake" class="watering-soil-intake">
      <view id="watering-soil-upload-board" class="watering-soil-upload-board">
        <image
          :src="diagnosisOrganUpload"
          class="watering-soil-upload-illustration"
          mode="aspectFit"
        />
        <view
          id="watering-soil-upload-zone"
          class="watering-soil-upload-zone"
          :class="{
            'watering-soil-upload-zone--has-image': soilOnlyImage?.previewUrl,
            'watering-soil-upload-zone--locked': isSoilInteractionLocked
          }"
          @click="handleSoilOnlyZoneClick"
        >
          <template v-if="soilOnlyImage?.previewUrl && !soilUploadLoading">
            <image
              :src="soilOnlyImage.previewUrl"
              class="watering-soil-upload-preview"
              mode="aspectFill"
            />
            <view
              v-if="isVisualScanning"
              id="watering-soil-scan-overlay"
              class="watering-soil-scan-overlay"
            >
              <view id="diagnose-visual-scan-line" class="diagnose-visual-scan-line" />
            </view>
          </template>
          <view v-else-if="soilUploadLoading" id="watering-soil-upload-loading" class="watering-soil-upload-zone-loading">
            <view class="diagnose-upload-spinner" />
          </view>
          <template v-else-if="!isVisualScanning && !soilUploadLoading">
            <image :src="diagnosisUploadIcon" class="watering-soil-upload-icon" mode="aspectFit" />
            <text class="watering-soil-upload-label">点击盆土区域上传照片</text>
          </template>
        </view>
      </view>
      <text class="watering-soil-upload-help">请俯拍盆土表面</text>
      <view v-if="soilOnlyImage?.previewUrl && !isSoilInteractionLocked" class="watering-soil-upload-actions">
        <text v-if="soilOnlyImage.sourceLabel" class="watering-soil-upload-source">
          {{ soilOnlyImage.sourceLabel }}
        </text>
        <view class="watering-soil-upload-action-group">
          <text id="watering-soil-replace-button" @click="requestSoilReplace">更换照片</text>
          <text id="watering-soil-remove-button" @click="requestSoilRemove">移除照片</text>
        </view>
      </view>
      <text v-else-if="soilOnlyImage?.previewUrl && soilLocked" id="watering-soil-analysis-locked-hint" class="watering-soil-analysis-locked-hint">
        已提交盆土分析，本次不能更换照片
      </text>
    </view>
    <view v-else id="diagnose-intake-sections" class="diagnose-intake-sections">
      <view
        id="diagnose-symptom-section"
        class="diagnose-section-card"
        :class="{ 'diagnose-section-card--disabled': isSymptomDisabled }"
      >
        <view id="diagnose-symptom-mode-toggle" class="diagnose-section-header">
          <text class="diagnose-section-title">常见明显症状</text>
        </view>
        <view
          id="diagnose-no-image-entry-panel"
          class="diagnose-section-content"
          :class="{ 'diagnose-section-content--disabled': isSymptomDisabled }"
        >
          <text class="diagnose-section-help">选择您观察到的症状（可多选）</text>
          <view
            id="3ef72261--diagnose-dev-symptom-class-quick-select"
            class="diagnose-quick-select"
          >
            <view
              v-for="item in SYMPTOM_MODE_DISPLAY_OPTIONS"
              :key="item.key"
              :id="`diagnose-dev-symptom-class-option-${item.classKey}`"
              class="diagnose-quick-option"
              :class="
                selectedDevSymptomClassKey === item.classKey ? 'diagnose-quick-option--active' : ''
              "
              @click="handleSymptomModeSelect(item)"
            >
              <text>{{ item.label }}</text>
            </view>
          </view>
          <view
            v-if="selectedDevSymptomClassOption"
            id="diagnose-dev-symptom-class-status"
            class="diagnose-symptom-status"
          >
            <text class="flex-1 text-[10px] leading-relaxed text-[#1F5A42]"
              >将根据“{{ selectedDevSymptomClassOption.symptomCn }}”开始提问。</text
            >
            <text
              id="diagnose-dev-symptom-class-clear-button"
              class="diagnose-symptom-clear"
              @click="handleSymptomClassClear"
              >清空</text
            >
          </view>
        </view>
      </view>

      <view
        id="diagnose-upload-section"
        class="diagnose-section-card"
        :class="{ 'diagnose-section-card--disabled': isAiDisabled }"
      >
        <view id="diagnose-upload-toggle" class="diagnose-section-header">
          <text class="diagnose-section-title">AI诊断</text>
        </view>
        <view
          id="diagnose-upload-content"
          class="diagnose-section-content"
          :class="{ 'diagnose-section-content--disabled': isAiDisabled }"
        >
          <text
            class="diagnose-section-help"
            :class="{ 'diagnose-section-help--scanning': isVisualScanning }"
          >
            {{ isVisualScanning ? visualScanText : '选择植物部位上传照片，最多 3 张' }}
          </text>
          <view id="diagnose-organ-upload-board" class="diagnose-organ-upload-board">
            <image
              :src="diagnosisOrganUpload"
              class="diagnose-organ-upload-illustration"
              mode="aspectFit"
            />
            <view
              v-if="isVisualScanning"
              id="diagnose-visual-scan-line"
              class="diagnose-visual-scan-line"
            />
            <template v-else>
              <view
                v-for="slot in ORGAN_UPLOAD_BUTTONS"
                :key="slot.slotType"
                :id="`diagnose-upload-${slot.slotType}-button`"
                class="diagnose-organ-slot"
                :class="[
                  `diagnose-organ-slot--${slot.slotType}`,
                  getSlotImage(slot.slotType)
                    ? ['diagnose-organ-slot--has-image', 'diagnose-organ-slot--uploaded']
                    : ''
                ]"
                @click="handleSlotClick(slot.slotType)"
              >
                <image
                  v-if="getSlotImage(slot.slotType)?.previewUrl"
                  :src="getSlotImage(slot.slotType).previewUrl"
                  class="diagnose-organ-slot-preview"
                  mode="aspectFill"
                />
                <view
                  v-else
                  class="diagnose-organ-slot-icon"
                  :class="slot.slotType === 'leaf' ? 'diagnose-organ-slot-icon--leaf' : ''"
                >
                  <image :src="slot.icon" class="diagnose-organ-slot-icon-image" mode="aspectFit" />
                </view>
                <text class="diagnose-organ-slot-label">{{
                  getSlotImage(slot.slotType) ? slot.uploadedLabel : slot.label
                }}</text>
                <text
                  v-if="!getSlotImage(slot.slotType) && getSlotImageCount(slot.slotType)"
                  class="diagnose-organ-slot-count"
                  >{{ getSlotImageCount(slot.slotType) }}</text
                >
                <view
                  v-if="getSlotImage(slot.slotType)"
                  :id="`diagnose-remove-image-${getSlotImageIndex(slot.slotType)}-button`"
                  class="diagnose-organ-slot-remove"
                  @click.stop="removeSlotImage(slot.slotType)"
                >
                  <text class="diagnose-organ-slot-remove-text">×</text>
                </view>
              </view>
            </template>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { computed, watch } from 'vue'
import diagnosisUploadIcon from '@/assets/diagnosis/diagnosis-back.svg'
import diagnosisOrganUpload from '@/assets/diagnosis/diagnosis-plant-upload.svg'
import { VISUAL_SCAN_LOADING_TEXT } from '@/constants/diagnosis-intake.js'
import { exposeViewProp } from '@/utils/component-view-proxy.js'
import { previewDiagnosisImage } from '@/utils/diagnosis-image-preview.js'

const EMPTY_SLOT_IMAGE_COUNT = 0
const FIRST_SLOT_IMAGE_INDEX = 0
const NO_SLOT_IMAGE_INDEX = -1

const SYMPTOM_MODE_DISPLAY_OPTIONS = [
  { key: 'yellowing', classKey: 'yellowing_mode', label: '叶子发黄' },
  { key: 'wilting', classKey: 'wilting_droop_mode', label: '枯萎' }
]

const ORGAN_UPLOAD_BUTTONS = [
  { slotType: 'whole_plant', label: '全株图', uploadedLabel: '全株图', icon: diagnosisUploadIcon },
  { slotType: 'leaf', label: '叶', uploadedLabel: '叶片', icon: diagnosisUploadIcon },
  { slotType: 'stem', label: '茎', uploadedLabel: '茎', icon: diagnosisUploadIcon },
  { slotType: 'soil', label: '土表', uploadedLabel: '土表', icon: diagnosisUploadIcon },
  { slotType: 'root_crown', label: '根', uploadedLabel: '根部', icon: diagnosisUploadIcon }
]

const INTAKE_DEFAULTS = {
  result: null,
  SYMPTOM_CLASS_QUICK_SELECT_OPTIONS: [],
  selectedDevSymptomClassKey: '',
  selectedDevSymptomClassOption: null,
  primarySlotGroups: [],
  imageFiles: [],
  PRIMARY_IMAGE_LIMIT: 3,
  isVisualScanning: false,
  visualScanText: VISUAL_SCAN_LOADING_TEXT,
  hasPendingUploads: false,
  hasUploadErrors: false,
  soilUploadLoading: false,
  soilLocked: false,
  handleSymptomClassQuickSelect: () => {},
  clearDevSymptomClass: () => {},
  chooseImage: () => {},
  removeImage: () => {},
  resetImages: () => {}
}

export default {
  props: {
    view: { type: Object, required: true },
    mode: { type: String, default: 'default' },
    soilImage: { type: Object, default: null }
  },
  emits: ['soil-select', 'soil-replace', 'soil-remove'],
  setup(props, { emit }) {
    const view = exposeViewProp(props, INTAKE_DEFAULTS)
    const isVisualScanning = computed(() => Boolean(view.isVisualScanning))
    const soilUploadLoading = computed(() => Boolean(view.soilUploadLoading))
    const soilLocked = computed(() => Boolean(view.soilLocked))
    const visualScanText = computed(() => String(view.visualScanText || VISUAL_SCAN_LOADING_TEXT))
    const selectedDevSymptomClassKey = computed(() =>
      String(view.selectedDevSymptomClassKey || '').trim()
    )
    const selectedDevSymptomClassOption = computed(() => view.selectedDevSymptomClassOption || null)
    const soilOnly = computed(() => props.mode === 'soil-only')
    const soilOnlyImage = computed(() => props.soilImage || getSlotImage('soil'))
    const isSoilInteractionLocked = computed(
      () => isVisualScanning.value || soilUploadLoading.value || soilLocked.value
    )
    const hasUploadedImages = computed(() => Boolean(view.imageFiles?.length))
    const isSymptomDisabled = computed(() => hasUploadedImages.value)
    const isAiDisabled = computed(() => Boolean(selectedDevSymptomClassKey.value))

    function resetImageUploads() {
      if (typeof view.resetImages !== 'function') {
        return
      }
      Promise.resolve(view.resetImages()).catch(() => {})
    }

    function getSlotImageCount(slotType) {
      return (
        view.primarySlotGroups?.find(slot => slot.slotType === slotType)?.items?.length ||
        EMPTY_SLOT_IMAGE_COUNT
      )
    }

    function getSlotImage(slotType) {
      return (
        view.primarySlotGroups?.find(slot => slot.slotType === slotType)?.items?.[
          FIRST_SLOT_IMAGE_INDEX
        ]?.item || null
      )
    }

    function getSlotImageIndex(slotType) {
      return (
        view.primarySlotGroups?.find(slot => slot.slotType === slotType)?.items?.[
          FIRST_SLOT_IMAGE_INDEX
        ]?.index ?? NO_SLOT_IMAGE_INDEX
      )
    }

    function handleSlotClick(slotType) {
      if (isAiDisabled.value || isVisualScanning.value) {
        return
      }
      const slotImage = getSlotImage(slotType)
      if (slotImage) {
        previewDiagnosisImage(slotImage, view.imageFiles)
        return
      }
      view.chooseImage(slotType)
    }

    function removeSlotImage(slotType) {
      if (isAiDisabled.value) {
        return
      }
      const index = getSlotImageIndex(slotType)
      if (index >= EMPTY_SLOT_IMAGE_COUNT) {
        view.removeImage(index)
      }
    }

    function handleSoilOnlyZoneClick() {
      if (isSoilInteractionLocked.value) {
        return
      }
      const image = soilOnlyImage.value
      if (image?.previewUrl) {
        previewDiagnosisImage(image, [image])
        return
      }
      emit('soil-select')
    }

    function requestSoilReplace() {
      if (!isSoilInteractionLocked.value) {
        emit('soil-replace')
      }
    }

    function requestSoilRemove() {
      if (!isSoilInteractionLocked.value) {
        emit('soil-remove')
      }
    }

    function handleSymptomModeSelect(option) {
      if (isSymptomDisabled.value || isVisualScanning.value) {
        return
      }
      const supportedOption = view.SYMPTOM_CLASS_QUICK_SELECT_OPTIONS?.find(
        item => item.classKey === option.classKey
      )
      if (!supportedOption && !view.imageFiles?.length) {
        uni.showToast({ title: '该症状请上传照片后进行综合诊断', icon: 'none' })
        return
      }
      view.handleSymptomClassQuickSelect(supportedOption || option)
    }

    function handleSymptomClassClear() {
      if (isSymptomDisabled.value) {
        return
      }
      view.clearDevSymptomClass()
    }

    watch(
      hasUploadedImages,
      hasImages => {
        if (hasImages) {
          view.clearDevSymptomClass()
        }
      },
      { immediate: true }
    )

    watch(selectedDevSymptomClassKey, selected => {
      if (selected) {
        resetImageUploads()
      }
    })

    return {
      ...view,
      isVisualScanning,
      soilUploadLoading,
      soilLocked,
      isSoilInteractionLocked,
      visualScanText,
      selectedDevSymptomClassKey,
      selectedDevSymptomClassOption,
      diagnosisOrganUpload,
      diagnosisUploadIcon,
      SYMPTOM_MODE_DISPLAY_OPTIONS,
      ORGAN_UPLOAD_BUTTONS,
      soilOnly,
      soilOnlyImage,
      hasUploadedImages,
      isSymptomDisabled,
      isAiDisabled,
      getSlotImageCount,
      getSlotImage,
      getSlotImageIndex,
      handleSlotClick,
      removeSlotImage,
      handleSoilOnlyZoneClick,
      requestSoilReplace,
      requestSoilRemove,
      handleSymptomModeSelect,
      handleSymptomClassClear
    }
  }
}
</script>

<style scoped>
.watering-soil-intake {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 22px 0 8px;
}
.watering-soil-upload-board {
  position: relative;
  width: 288px;
  height: 270px;
  overflow: hidden;
  border-radius: 18px;
  background: rgba(241, 248, 244, 0.5);
}
.watering-soil-upload-illustration {
  position: absolute;
  inset: 0;
  width: 288px;
  height: 270px;
  opacity: 0.34;
  filter: saturate(0.55);
}
.watering-soil-upload-zone {
  position: absolute;
  top: 164px;
  left: 66px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 7px;
  width: 156px;
  height: 76px;
  overflow: hidden;
  border: 2px solid #2d7a4f;
  border-radius: 46% 46% 34% 34%;
  background: rgba(248, 255, 249, 0.9);
  box-shadow: 0 0 0 6px rgba(45, 122, 79, 0.1);
  animation: watering-soil-breathe 1.8s ease-in-out infinite;
}
.watering-soil-upload-zone--has-image {
  animation: none;
  background: #eef3f0;
}
.watering-soil-upload-zone--locked { opacity: 0.9; }
.watering-soil-upload-preview {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.watering-soil-scan-overlay {
  position: absolute;
  inset: 0;
  z-index: 2;
  overflow: hidden;
  background: linear-gradient(180deg, rgba(45, 122, 79, 0.08), rgba(45, 122, 79, 0.02));
  pointer-events: none;
}
.watering-soil-scan-overlay .diagnose-visual-scan-line {
  animation-name: watering-soil-visual-scan;
}
.watering-soil-upload-icon {
  width: 20px;
  height: 20px;
}
.watering-soil-upload-label {
  color: #1f5a42;
  font-size: 13px;
  font-weight: 700;
}
.watering-soil-upload-zone-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.watering-soil-upload-help {
  margin-top: 14px;
  color: #5a7a68;
  font-size: 13px;
  line-height: 20px;
}
.watering-soil-upload-actions {
  display: flex;
  width: 288px;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
  color: #5a7a68;
  font-size: 12px;
}
.watering-soil-analysis-locked-hint { margin-top: 10px; color: #5a7868; font-size: 12px; line-height: 18px; }
.watering-soil-upload-source {
  max-width: 162px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.watering-soil-upload-action-group {
  display: flex;
  gap: 16px;
  color: #2d7a4f;
  font-weight: 700;
}
.watering-soil-upload-action-group text:last-child {
  color: #8a6046;
}
@keyframes watering-soil-breathe {
  0%,
  100% {
    transform: scale(1);
    box-shadow: 0 0 0 6px rgba(45, 122, 79, 0.1);
  }
  50% {
    transform: scale(1.025);
    box-shadow: 0 0 0 10px rgba(45, 122, 79, 0.16);
  }
}
@keyframes watering-soil-visual-scan {
  from {
    transform: translateY(0);
  }
  to {
    transform: translateY(74px);
  }
}
.diagnose-no-image-panel {
  margin-bottom: 12px;
  padding: 12px;
  border: 1px solid #b7dcc5;
  border-radius: 16px;
  background: linear-gradient(135deg, #f3faf5 0%, #fffdf8 100%);
}
.diagnose-no-image-tag {
  flex-shrink: 0;
  padding: 3px 7px;
  border-radius: 999px;
  background: #d8f3dc;
  color: #1f5a42;
  font-size: 10px;
  font-weight: 700;
}
.diagnose-quick-select {
  position: relative;
  width: 328px;
  height: 43px;
  margin-top: 12px;
}
.diagnose-quick-option {
  position: absolute;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 43px;
  padding: 8px 12px;
  border: 2px solid rgba(45, 122, 79, 0.3);
  border-radius: 999px;
  color: #0a0a0a;
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
  white-space: nowrap;
}
.diagnose-quick-option:nth-child(1) {
  top: 0;
  left: 0;
  width: 99px;
}
.diagnose-quick-option:nth-child(2) {
  top: 0;
  left: 109px;
  width: 67px;
}
.diagnose-quick-option--active {
  border-color: #2d7a4f;
  background: #d8f3dc;
  color: #0a0a0a;
}
.diagnose-symptom-status {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 12px;
  background: rgba(216, 243, 220, 0.62);
}
.diagnose-symptom-clear {
  flex-shrink: 0;
  color: #8b7355;
  font-size: 10px;
  font-weight: 700;
}
.diagnose-slot-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.diagnose-slot-card {
  border-radius: 16px;
  padding: 10px;
}
.diagnose-slot-thumb-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.diagnose-upload-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid #b7dcc5;
  border-top-color: #2d6a4f;
  border-radius: 50%;
  animation: diagnose-intake-spin 0.8s linear infinite;
}
@keyframes diagnose-intake-spin {
  to {
    transform: rotate(360deg);
  }
}
.diagnose-intake-sections {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.diagnose-section-card {
  overflow: hidden;
  border: 1px solid rgba(45, 122, 79, 0.15);
  border-radius: 12px;
  background: #f8faf9;
}
.diagnose-section-card--disabled {
  opacity: 0.45;
}
.diagnose-section-content--disabled {
  pointer-events: none;
}
.diagnose-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
}
.diagnose-section-title {
  color: #0a0a0a;
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
}
.diagnose-section-action,
.diagnose-section-help {
  color: #5a7a68;
  font-size: 14px;
  line-height: 20px;
}
.diagnose-section-content {
  border-top: 1px solid rgba(45, 122, 79, 0.15);
  padding: 16px;
}
.diagnose-section-help {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.diagnose-section-help--scanning {
  overflow: visible;
  text-overflow: clip;
  white-space: normal;
  word-break: break-all;
}
.diagnose-organ-upload-board {
  position: relative;
  box-sizing: border-box;
  width: 328px;
  height: 416px;
  margin: 16px auto 0;
  overflow: hidden;
  border: 1px solid rgba(45, 122, 79, 0.15);
  border-radius: 12px;
  background: rgba(241, 248, 244, 0.5);
}
.diagnose-organ-upload-illustration {
  position: absolute;
  inset: 0;
  width: 327px;
  height: 415px;
}
.diagnose-visual-scan-line {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  z-index: 2;
  height: 2px;
  background: #2d7a4f;
  box-shadow: 0 0 12px 2px rgba(45, 122, 79, 0.6);
  animation: diagnose-visual-scan 1.8s ease-in-out infinite alternate;
  will-change: transform;
}
@keyframes diagnose-visual-scan {
  from {
    transform: translateY(0);
  }
  to {
    transform: translateY(414px);
  }
}
.diagnose-organ-slot {
  position: absolute;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 49px;
  padding: 8px;
  border: 2px dashed rgba(45, 122, 79, 0.82);
  border-radius: 12px;
  background: rgba(248, 250, 249, 0.9);
  box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.1),
    0 1px 2px rgba(0, 0, 0, 0.1);
  color: #0a0a0a;
}
.diagnose-organ-slot--whole_plant {
  top: 12px;
  left: 108px;
  width: 112px;
}
.diagnose-organ-slot--leaf {
  top: 64px;
  left: 12px;
  width: 85px;
}
.diagnose-organ-slot--stem {
  top: 216px;
  left: 244px;
  width: 71px;
}
.diagnose-organ-slot--soil {
  top: 210px;
  left: 12px;
  width: 85px;
}
.diagnose-organ-slot--root_crown {
  top: 316px;
  left: 230px;
  width: 85px;
}
.diagnose-organ-slot-icon {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: rgba(45, 122, 79, 0.1);
}
.diagnose-organ-slot-icon--leaf {
  background: rgba(165, 214, 167, 0.3);
}
.diagnose-organ-slot-icon-image {
  width: 16px;
  height: 16px;
}
.diagnose-organ-slot-preview {
  flex: none;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: #eef3f0;
}
.diagnose-organ-slot-label {
  flex: 0 0 auto;
  min-width: 0;
  max-width: none;
  overflow: visible;
  font-size: 14px;
  line-height: 20px;
  text-overflow: clip;
  white-space: nowrap;
}
.diagnose-organ-slot-count {
  flex: none;
  color: #5a7a68;
  font-size: 10px;
  line-height: 14px;
}
.diagnose-organ-slot--has-image {
  border-color: #2d7a4f;
  background: #eef8f0;
}
.diagnose-organ-slot--uploaded {
  gap: 6px;
}
.diagnose-organ-slot-remove {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  background: #d32f2f;
}
.diagnose-organ-slot-remove-text {
  color: #ffffff;
  font-size: 18px;
  font-weight: 500;
  line-height: 20px;
}
</style>
