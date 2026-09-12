<template>
  <view v-if="!result" id="diagnose-upload-stage">
    <view id="diagnose-upload-section" class="mb-4">
      <text class="block mb-2 text-base font-semibold text-gray-900">拍摄植物照片</text>
      <text class="block mb-3 text-xs text-gray-500"
        >请直接在槽位中上传。单槽最多 2 张，总计最多 3 张。</text
      >
      <view id="diagnose-profile-switch" class="mb-3 flex rounded-lg bg-white p-1">
        <view
          id="diagnose-profile-full-button"
          class="flex-1 rounded-md px-3 py-2 text-center text-xs font-semibold"
          :class="
            selectedDiagnosisProfile === 'full' ? 'bg-[#2D6A4F] text-white' : 'text-[#2D6A4F]'
          "
          @click="setDiagnosisProfile('full')"
          ><text>综合诊断</text></view
        >
        <view
          id="diagnose-profile-pest-button"
          class="flex-1 rounded-md px-3 py-2 text-center text-xs font-semibold"
          :class="
            selectedDiagnosisProfile === 'pest' ? 'bg-[#2D6A4F] text-white' : 'text-[#2D6A4F]'
          "
          @click="setDiagnosisProfile('pest')"
          ><text>只看虫害</text></view
        >
      </view>
      <view id="diagnose-no-image-entry-panel" class="diagnose-no-image-panel">
        <view class="mb-2 flex items-start justify-between gap-2">
          <view class="min-w-0 flex-1">
            <text class="block text-xs font-semibold text-[#1F5A42]">没有照片时</text>
            <text class="mt-0.5 block text-[10px] text-gray-500"
              >只支持叶子发黄、发蔫或下垂；只看虫害需要照片。</text
            >
          </view>
        </view>
        <view id="3ef72261--diagnose-dev-symptom-class-quick-select" class="diagnose-quick-select">
          <view
            v-for="item in SYMPTOM_CLASS_QUICK_SELECT_OPTIONS"
            :key="item.classKey"
            :id="`diagnose-dev-symptom-class-option-${item.classKey}`"
            class="diagnose-quick-option"
            :class="
              selectedDevSymptomClassKey === item.classKey ? 'diagnose-quick-option--active' : ''
            "
            @click="handleSymptomClassQuickSelect(item)"
          >
            <text>{{ item.classNameCn }}</text>
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
      <view id="diagnose-upload-slot-grid" class="diagnose-slot-grid">
        <view
          v-for="slot in primarySlotGroups"
          :key="slot.slotType"
          :id="`diagnose-upload-slot-${slot.slotType}`"
          class="diagnose-slot-card border border-white/80 bg-[#F8F6F0]"
        >
          <view class="mb-2 flex items-start justify-between gap-2">
            <view class="min-w-0 flex-1">
              <text class="block text-xs font-semibold text-gray-900">{{ slot.label }}</text>
              <text class="mt-0.5 block text-[10px] text-gray-500">{{
                slot.items.length ? `已放入 ${slot.items.length} 张` : '点击上传到此槽位'
              }}</text>
            </view>
            <text class="text-[10px] text-[#8B7355]"
              >{{ slot.items.length }}/{{ slot.capacity }}</text
            >
          </view>
          <view class="diagnose-slot-thumb-grid">
            <view
              v-for="entry in slot.items"
              :key="entry.item.id"
              class="relative aspect-square overflow-hidden rounded-xl bg-white"
            >
              <image :src="entry.item.previewUrl" class="h-full w-full" mode="aspectFill" />
              <view
                v-if="entry.item.loading"
                class="absolute inset-0 flex flex-col items-center justify-center bg-white/75"
                ><view class="diagnose-upload-spinner mb-2" /><text
                  class="text-[11px] font-medium text-[#2D6A4F]"
                  >上传中</text
                ></view
              >
              <view
                v-else-if="entry.item.status === 'error'"
                class="absolute inset-x-0 bottom-0 bg-red-500/90 px-2 py-1"
                ><text class="block text-[10px] leading-tight text-white">{{
                  entry.item.error || '上传失败'
                }}</text></view
              >
              <view
                :id="`diagnose-remove-image-${entry.index}-button`"
                class="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500"
                @click.stop="removeImage(entry.index)"
                ><text class="text-xs text-white">×</text></view
              >
            </view>
            <view
              v-if="slot.canAdd"
              :id="`diagnose-upload-${slot.slotType}-button`"
              class="aspect-square flex flex-col items-center justify-center rounded-xl border border-dashed border-[#B7DCC5] bg-white"
              @click="chooseImage(slot.slotType)"
              ><text class="mb-0.5 text-xl text-[#8FB69B]">+</text
              ><text class="px-1 text-center text-[9px] text-[#8FB69B]">{{
                slot.items.length ? '继续上传' : '上传到此槽位'
              }}</text></view
            >
          </view>
        </view>
      </view>
      <text id="diagnose-upload-count" class="mt-2 block text-center text-[10px] text-gray-400"
        >{{ imageFiles.length }}/{{ PRIMARY_IMAGE_LIMIT }} 张</text
      >
      <text
        v-if="hasPendingUploads"
        id="diagnose-upload-pending-status"
        class="mt-1 block text-center text-[10px] text-[#2D6A4F]"
        >图片上传中，全部处理完成后可开始诊断</text
      >
      <text
        v-else-if="hasUploadErrors"
        id="diagnose-upload-error-status"
        class="mt-1 block text-center text-[10px] text-red-500"
        >存在上传失败的图片，请删除后重新添加</text
      >
      <view id="diagnose-capture-guidance" class="mt-3 rounded-xl bg-[#D8F3DC] p-3"
        ><text class="mb-1 block text-xs font-semibold text-primary">拍摄建议</text
        ><text class="block text-[10px] leading-relaxed text-gray-700">• 光线充足，避免逆光</text
        ><text class="block text-[10px] leading-relaxed text-gray-700"
          >• 优先保留叶片特写、茎部或根颈近照、盆土/盆面图、整株图</text
        ><text class="block text-[10px] leading-relaxed text-gray-700"
          >• 若已知部位，请为每张图选择对应槽位</text
        ></view
      >
    </view>
  </view>
</template>

<script>
import { exposeViewProp } from '@/utils/component-view-proxy.js'

const INTAKE_DEFAULTS = {
  result: null,
  SYMPTOM_CLASS_QUICK_SELECT_OPTIONS: [],
  selectedDevSymptomClassKey: '',
  selectedDevSymptomClassOption: null,
  selectedDiagnosisProfile: 'full',
  primarySlotGroups: [],
  imageFiles: [],
  PRIMARY_IMAGE_LIMIT: 3,
  hasPendingUploads: false,
  hasUploadErrors: false,
  setDiagnosisProfile: () => {},
  handleSymptomClassQuickSelect: () => {},
  clearDevSymptomClass: () => {},
  chooseImage: () => {},
  removeImage: () => {}
}

export default {
  props: { view: { type: Object, required: true } },
  setup(props) {
    return exposeViewProp(props, INTAKE_DEFAULTS)
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
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-height: 116px;
  margin-top: 8px;
  overflow-y: auto;
}
.diagnose-quick-option {
  padding: 5px 8px;
  border: 1px solid rgba(45, 106, 79, 0.16);
  border-radius: 999px;
  background: #fff;
  color: #456052;
  font-size: 10px;
  font-weight: 600;
}
.diagnose-quick-option--active {
  border-color: #2d6a4f;
  background: #d8f3dc;
  color: #1f5a42;
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
</style>
