<template>
  <BottomSheet
    ref="popupRef"
    panel-id="watering-date-picker-sheet"
    content-id="watering-date-picker-content"
    close-id="watering-date-picker-close-button"
    title="选择浇水日期"
    subtitle="记得最近一次即可；如果记得更多日期，再继续补充。"
    height-mode="fullHeight"
  >
    <view class="pt-1">
      <CareBehaviorTimeline
        id-prefix="home-watering"
        :sticky="true"
        :timeline="timeline"
        :loading="loading"
        :error="error"
        :enable-dose-per-date="true"
        :pot-volume-ml="potVolumeMl"
        @change="$emit('timeline-change', $event)"
      />
    </view>
    <template #confirm>
      <view class="flex gap-3">
        <button
          id="watering-date-picker-cancel-button"
          class="m-0 flex-1 rounded-[10px] border border-gray-200 bg-white py-2.5 text-sm text-gray-700 after:border-0"
          hover-class="none"
          @click="close"
        >
          取消
        </button>
        <button
          id="watering-date-picker-confirm-button"
          class="m-0 flex-1 rounded-[10px] bg-[#2d7a4f] py-2.5 text-sm font-medium text-white after:border-0"
          hover-class="none"
          @click="$emit('confirm')"
        >
          确认
        </button>
      </view>
    </template>
  </BottomSheet>
</template>

<script setup>
import { ref } from 'vue'
import BottomSheet from '@/components/common/BottomSheet.vue'
import CareBehaviorTimeline from '@/components/CareBehaviorTimeline.vue'

defineProps({
  timeline: { type: Object, default: () => ({}) },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  potVolumeMl: { type: Number, default: 0 }
})
defineEmits(['timeline-change', 'confirm'])

const popupRef = ref(null)
function open() {
  return popupRef.value?.open?.()
}
function close() {
  return popupRef.value?.close?.()
}
defineExpose({ open, close })
</script>
