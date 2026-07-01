<template>
  <view class="mx-4 mt-2 rounded-[12px] border border-gray-100 bg-white p-3 shadow-sm">
    <text class="block text-sm font-medium text-gray-900">记得水量吗？</text>
    <text class="mt-0.5 block text-xs text-gray-400">喷雾不计入根区浇水，浇透会提高过浇风险</text>
    <!-- 5 档滑杆（Figma 317:331） -->
    <view class="mt-3 flex items-center justify-between">
      <view
        v-for="opt in doseOptions"
        :key="opt.value"
        class="flex flex-col items-center"
        @click="selectDose(opt.value)"
      >
        <view
          class="flex items-center justify-center rounded-full"
          :class="[
            opt.value === 'small'
              ? modelValue === opt.value
                ? 'size-[22px]'
                : 'size-[14px]'
              : modelValue === opt.value
                ? 'size-5'
                : 'size-3',
            modelValue === opt.value ? 'bg-[#2f8f57]' : 'bg-gray-200'
          ]"
        >
          <view
            v-if="modelValue === opt.value"
            class="rounded-full bg-white"
            :class="opt.value === 'small' ? 'size-2.5' : 'size-2'"
          />
        </view>
        <text
          class="mt-1 text-[10px]"
          :class="modelValue === opt.value ? 'text-[#2f8f57] font-medium' : 'text-gray-400'"
        >
          {{ opt.label }}
        </text>
      </view>
    </view>
    <!-- 滑杆轨道 -->
    <view class="mt-1 h-1 rounded-full bg-gray-100">
      <view
        class="h-1 rounded-full bg-[#2f8f57] transition-all"
        :style="{ width: sliderPercent + '%' }"
      />
    </view>
    <view class="mt-3 h-px bg-gray-100" />
    <view class="flex gap-3 pt-3">
      <button
        class="m-0 flex-1 rounded-[10px] border border-gray-200 bg-white py-2.5 text-sm text-gray-700 after:border-0"
        hover-class="none"
        @click="emit('cancel')"
      >
        取消
      </button>
      <button
        class="m-0 flex-1 rounded-[10px] bg-[#2d7a4f] py-2.5 text-sm font-medium text-white after:border-0"
        hover-class="none"
        @click="emit('confirm')"
      >
        确认
      </button>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: 'normal' }
})

const emit = defineEmits(['update:modelValue', 'cancel', 'confirm'])

const doseOptions = [
  { label: '不知道', value: 'unknown' },
  { label: '喷雾', value: 'mist' },
  { label: '少量', value: 'small' },
  { label: '普通', value: 'normal' },
  { label: '浇透', value: 'thorough' }
]

const sliderPercent = computed(() => {
  const idx = doseOptions.findIndex(opt => opt.value === props.modelValue)
  if (idx < 0) {
    return 0
  }
  return Math.round((idx / (doseOptions.length - 1)) * 100)
})

function selectDose(value) {
  emit('update:modelValue', value)
}
</script>
