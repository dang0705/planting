<template>
  <view v-if="!result" id="diagnose-upload-stage">
    <view id="diagnose-intake-sections" class="diagnose-intake-sections">
      <view id="diagnose-symptom-section" class="diagnose-section-card">
        <view
          id="diagnose-symptom-mode-toggle"
          class="diagnose-section-header"
          @click="toggleSection('symptom')"
        >
          <text class="diagnose-section-title">症状模式</text>
          <text class="diagnose-section-action">{{
            expandedSection === 'symptom' ? '收起' : '展开'
          }}</text>
        </view>
        <view
          v-if="expandedSection === 'symptom'"
          id="diagnose-no-image-entry-panel"
          class="diagnose-section-content"
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
              @click="clearDevSymptomClass"
              >清空</text
            >
          </view>
        </view>
      </view>

      <view id="diagnose-upload-section" class="diagnose-section-card">
        <view
          id="diagnose-upload-toggle"
          class="diagnose-section-header"
          @click="toggleSection('upload')"
        >
          <text class="diagnose-section-title">上传照片</text>
          <text class="diagnose-section-action">{{
            expandedSection === 'upload' ? '收起' : '展开'
          }}</text>
        </view>
        <view
          v-if="expandedSection === 'upload'"
          id="diagnose-upload-content"
          class="diagnose-section-content"
        >
          <text class="diagnose-section-help">
            {{ isVisualScanning ? '正在扫描分析植物状态…' : '选择植物部位上传照片，最多 3 张' }}
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
                  getSlotImageCount(slot.slotType) ? 'diagnose-organ-slot--has-image' : ''
                ]"
                @click="chooseImage(slot.slotType)"
              >
                <view
                  class="diagnose-organ-slot-icon"
                  :class="slot.slotType === 'leaf' ? 'diagnose-organ-slot-icon--leaf' : ''"
                >
                  <image
                    :src="slot.icon"
                    class="diagnose-organ-slot-icon-image"
                    mode="aspectFit"
                  />
                </view>
                <text class="diagnose-organ-slot-label">{{ slot.label }}</text>
                <text
                  v-if="getSlotImageCount(slot.slotType)"
                  class="diagnose-organ-slot-count"
                  >{{ getSlotImageCount(slot.slotType) }}</text
                >
              </view>
            </template>
          </view>
          <view
            v-if="!isVisualScanning && imageFiles.length"
            id="diagnose-uploaded-image-list"
            class="diagnose-uploaded-image-list"
          >
            <view
              v-for="(item, index) in imageFiles"
              :key="item.id || index"
              class="diagnose-uploaded-image"
            >
              <image :src="item.previewUrl" class="h-full w-full" mode="aspectFill" />
              <view
                v-if="item.loading"
                class="absolute inset-0 flex items-center justify-center bg-white/75"
                ><text class="text-[10px] text-[#2D6A4F]">上传中</text></view
              >
              <view
                v-else-if="item.status === 'error'"
                class="absolute inset-x-0 bottom-0 bg-red-500/90 px-1 py-0.5"
                ><text class="block truncate text-[9px] text-white">{{
                  item.error || '上传失败'
                }}</text></view
              >
              <view
                :id="`diagnose-remove-image-${index}-button`"
                class="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500"
                @click.stop="removeImage(index)"
                ><text class="text-xs text-white">×</text></view
              >
            </view>
          </view>
          <text
            v-if="!isVisualScanning && hasPendingUploads"
            id="diagnose-upload-pending-status"
            class="mt-1 block text-center text-[10px] text-[#2D6A4F]"
            >图片上传中，全部处理完成后可开始诊断</text
          >
          <text
            v-else-if="!isVisualScanning && hasUploadErrors"
            id="diagnose-upload-error-status"
            class="mt-1 block text-center text-[10px] text-red-500"
            >存在上传失败的图片，请删除后重新添加</text
          >
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { computed, ref, watch } from 'vue'
import diagnosisUploadIcon from '@/assets/diagnosis/diagnosis-back.svg'
import diagnosisOrganUpload from '@/assets/diagnosis/diagnosis-plant-upload.svg'
import { exposeViewProp } from '@/utils/component-view-proxy.js'

const SYMPTOM_MODE_DISPLAY_OPTIONS = [
  { key: 'yellowing', classKey: 'yellowing_mode', label: '叶子发黄' },
  { key: 'wilting', classKey: 'wilting_droop_mode', label: '枯萎' },
  { key: 'black_spot', classKey: 'black_spot_visual', label: '黑斑' },
  { key: 'brown_spot', classKey: 'brown_spot_visual', label: '褐斑' },
  { key: 'poor_growth', classKey: 'poor_growth_visual', label: '长势不佳' }
]

const ORGAN_UPLOAD_BUTTONS = [
  { slotType: 'whole_plant', label: '全株图', icon: diagnosisUploadIcon },
  { slotType: 'leaf', label: '叶', icon: diagnosisUploadIcon },
  { slotType: 'stem', label: '茎', icon: diagnosisUploadIcon },
  { slotType: 'soil', label: '土表', icon: diagnosisUploadIcon },
  { slotType: 'root_crown', label: '根', icon: diagnosisUploadIcon }
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
  hasPendingUploads: false,
  hasUploadErrors: false,
  handleSymptomClassQuickSelect: () => {},
  clearDevSymptomClass: () => {},
  chooseImage: () => {},
  removeImage: () => {}
}

export default {
  props: { view: { type: Object, required: true } },
  setup(props) {
    const expandedSection = ref('upload')
    const view = exposeViewProp(props, INTAKE_DEFAULTS)
    const isVisualScanning = computed(() => Boolean(view.isVisualScanning))

    function toggleSection(section) {
      if (isVisualScanning.value) {
        return
      }

      const sectionKey = section === 'symptom' ? 'symptom' : 'upload'
      expandedSection.value =
        expandedSection.value === sectionKey
          ? sectionKey === 'symptom'
            ? 'upload'
            : 'symptom'
          : sectionKey
    }

    function getSlotImageCount(slotType) {
      return view.primarySlotGroups?.find(slot => slot.slotType === slotType)?.items?.length || 0
    }

    function handleSymptomModeSelect(option) {
      const supportedOption = view.SYMPTOM_CLASS_QUICK_SELECT_OPTIONS?.find(
        item => item.classKey === option.classKey
      )
      if (!supportedOption && !view.imageFiles?.length) {
        uni.showToast({ title: '该症状请上传照片后进行综合诊断', icon: 'none' })
        return
      }
      view.handleSymptomClassQuickSelect(supportedOption || option)
    }

    watch(
      isVisualScanning,
      scanning => {
        if (scanning) {
          expandedSection.value = 'upload'
        }
      },
      { immediate: true }
    )

    return {
      ...view,
      isVisualScanning,
      diagnosisOrganUpload,
      SYMPTOM_MODE_DISPLAY_OPTIONS,
      ORGAN_UPLOAD_BUTTONS,
      expandedSection,
      toggleSection,
      getSlotImageCount,
      handleSymptomModeSelect
    }
  }
}
</script>

<style scoped>
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
  height: 95px;
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
.diagnose-quick-option:nth-child(3) {
  top: 0;
  left: 185px;
  width: 67px;
}
.diagnose-quick-option:nth-child(4) {
  top: 51px;
  left: 0;
  width: 67px;
}
.diagnose-quick-option:nth-child(5) {
  top: 51px;
  left: 76px;
  width: 99px;
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
  gap: 8px;
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
.diagnose-organ-slot-label {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  line-height: 20px;
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
.diagnose-organ-slot--leaf {
  border-color: #a5d6a7;
}
.diagnose-uploaded-image-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 12px;
}
.diagnose-uploaded-image {
  position: relative;
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: 12px;
  background: #ffffff;
}
</style>
