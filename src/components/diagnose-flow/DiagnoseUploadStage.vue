<template>
  <view v-if="!result" id="diagnose-upload-stage">
    <view id="diagnose-upload-section" class="mb-4">
      <text class="block text-base font-semibold text-gray-900 mb-2">拍摄植物照片</text>
      <text class="block text-xs text-gray-500 mb-3"
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
        >
          <text>综合诊断</text>
        </view>
        <view
          id="diagnose-profile-pest-button"
          class="flex-1 rounded-md px-3 py-2 text-center text-xs font-semibold"
          :class="
            selectedDiagnosisProfile === 'pest' ? 'bg-[#2D6A4F] text-white' : 'text-[#2D6A4F]'
          "
          @click="setDiagnosisProfile('pest')"
        >
          <text>只看虫害</text>
        </view>
      </view>
      <view id="diagnose-no-image-entry-panel" class="dev-visual-evidence-panel">
        <view class="flex items-start justify-between gap-2 mb-2">
          <view class="min-w-0 flex-1">
            <text class="block text-xs font-semibold text-[#1F5A42]">没有照片时</text>
            <text class="block text-[10px] text-gray-500 mt-0.5">
              只支持叶子发黄、发蔫或下垂；只看虫害需要照片。</text
            ></view
          >
          <text class="dev-visual-evidence-tag">问诊</text></view
        >
        <view
          id="3ef72261--diagnose-dev-symptom-class-quick-select"
          class="dev-visual-evidence-quick-select"
        >
          <view
            v-for="item in SYMPTOM_CLASS_QUICK_SELECT_OPTIONS"
            :key="item.classKey"
            :id="`diagnose-dev-symptom-class-option-${item.classKey}`"
            class="dev-visual-evidence-quick-option"
            :class="
              selectedDevSymptomClassKey === item.classKey
                ? 'dev-visual-evidence-quick-option--active'
                : ''
            "
            @click="handleSymptomClassQuickSelect(item)"
          >
            <text>{{ item.classNameCn }}</text></view
          ></view
        >
        <view
          v-if="selectedDevSymptomClassOption"
          id="diagnose-dev-symptom-class-status"
          class="dev-visual-evidence-status"
        >
          <text class="flex-1 text-[10px] text-[#1F5A42] leading-relaxed">
            将以无图症状模式开始问诊：{{ selectedDevSymptomClassOption.symptomCn }}（{{
              selectedDevSymptomClassOption.classNameCn
            }}）</text
          >
          <text
            id="diagnose-dev-symptom-class-clear-button"
            class="dev-visual-evidence-clear"
            @click="clearDevSymptomClass"
          >
            清空</text
          ></view
        ></view
      >
      <view id="diagnose-upload-slot-grid" class="slot-grid">
        <view
          v-for="slot in primarySlotGroups"
          :key="slot.slotType"
          :id="`diagnose-upload-slot-${slot.slotType}`"
          class="slot-card bg-[#F8F6F0] border border-white/80"
        >
          <view class="flex items-start justify-between gap-2 mb-2">
            <view class="min-w-0 flex-1">
              <text class="block text-xs font-semibold text-gray-900">{{ slot.label }}</text>
              <text class="block text-[10px] text-gray-500 mt-0.5">
                {{
                  slot.items.length ? `已放入 ${slot.items.length} 张` : '点击上传到此槽位'
                }}</text
              ></view
            >
            <text class="text-[10px] text-[#8B7355]"
              >{{ slot.items.length }}/{{ slot.capacity }}</text
            ></view
          >
          <view class="slot-thumb-grid">
            <view
              v-for="entry in slot.items"
              :key="entry.item.id"
              class="relative aspect-square bg-white rounded-xl overflow-hidden"
            >
              <image :src="entry.item.previewUrl" class="w-full h-full" mode="aspectFill" />
              <view
                v-if="entry.item.loading"
                class="absolute inset-0 bg-white/75 flex flex-col items-center justify-center"
              >
                <view class="upload-spinner mb-2" />
                <text class="text-[11px] text-[#2D6A4F] font-medium">上传中</text></view
              >
              <view
                v-else-if="entry.item.status === 'error'"
                class="absolute inset-x-0 bottom-0 bg-red-500/90 px-2 py-1"
              >
                <text class="block text-[10px] text-white leading-tight">
                  {{ entry.item.error || '上传失败' }}</text
                ></view
              >
              <view
                class="absolute top-1 right-1 bg-red-500 rounded-full w-5 h-5 flex items-center justify-center"
                :id="`diagnose-remove-image-${entry.index}-button`"
                @click.stop="removeImage(entry.index)"
              >
                <text class="text-white text-xs">×</text></view
              ></view
            >
            <view
              v-if="slot.canAdd"
              :id="`diagnose-upload-${slot.slotType}-button`"
              class="aspect-square bg-white rounded-xl flex flex-col items-center justify-center border border-dashed border-[#B7DCC5]"
              @click="chooseImage(slot.slotType)"
            >
              <text class="text-xl text-[#8FB69B] mb-0.5">+</text>
              <text class="text-[9px] text-[#8FB69B] text-center px-1">
                {{ slot.items.length ? '继续上传' : '上传到此槽位' }}</text
              ></view
            ></view
          ></view
        ></view
      >
      <text id="diagnose-upload-count" class="block text-[10px] text-gray-400 text-center mt-2">
        {{ imageFiles.length }}/{{ PRIMARY_IMAGE_LIMIT }} 张</text
      >
      <text
        v-if="hasPendingUploads"
        id="diagnose-upload-pending-status"
        class="block text-[10px] text-[#2D6A4F] text-center mt-1"
      >
        图片上传中，全部处理完成后可开始诊断</text
      >
      <text
        v-else-if="hasUploadErrors"
        id="diagnose-upload-error-status"
        class="block text-[10px] text-red-500 text-center mt-1"
      >
        存在上传失败的图片，请删除后重新添加</text
      ></view
    >
    <view id="diagnose-capture-guidance" class="mt-3 bg-[#D8F3DC] rounded-xl p-3">
      <text class="block text-xs font-semibold text-primary mb-1">拍摄建议</text>
      <text class="block text-[10px] text-gray-700 leading-relaxed"> • 光线充足，避免逆光</text>
      <text class="block text-[10px] text-gray-700 leading-relaxed">
        • 优先保留叶片特写、茎部或根颈近照、整株图</text
      >
      <text class="block text-[10px] text-gray-700 leading-relaxed">
        • 若已知部位，请为每张图选择对应槽位</text
      ></view
    ></view
  >
</template>

<script>
import { exposeViewProp } from '@/utils/component-view-proxy.js'
import { DIAGNOSE_VIEW_DEFAULTS } from './view-defaults.js'

export default {
  props: {
    view: { type: Object, required: true }
  },
  setup(props) {
    return exposeViewProp(props, DIAGNOSE_VIEW_DEFAULTS)
  }
}
</script>

<style scoped src="./style.css"></style>
