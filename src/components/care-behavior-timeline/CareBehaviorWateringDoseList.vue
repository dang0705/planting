<template>
  <view
    v-if="rows.length"
    class="care-dose-list mt-3 rounded-[12px] border border-gray-100 bg-white p-3"
  >
    <text class="block text-sm font-medium text-gray-900">每次浇了多少水？</text>
    <text class="mt-0.5 block text-xs text-gray-400">{{ doseRefText }}</text>
    <view v-for="row in rows" :key="row.date" class="mt-3">
      <view class="flex items-center justify-between">
        <text class="text-xs font-medium text-gray-700">{{ row.date }}</text>
        <text class="text-[10px] text-[#2f8f57]">{{ doseLabel(row.amountMl) }}</text>
      </view>
      <view class="mt-2">
        <slider
          :id="`watering-dose-slider-${row.date}`"
          class="dose-slider w-full min-w-0 m-0"
          :min="0"
          :max="sliderMaxIndex"
          :step="1"
          :value="doseOptionIndex(row.amountMl)"
          activeColor="#2f8f57"
          backgroundColor="#e5e7eb"
          block-color="#ffffff"
          block-size="18"
          @change="onDoseSliderChange(row.date, $event)"
        />
        <view class="relative mt-1 h-4 w-full">
          <text
            v-for="(opt, index) in bottleOptions"
            :key="opt.label"
            class="absolute leading-4 text-[10px] text-gray-400 whitespace-nowrap"
            :class="index === 0 ? 'text-left' : index === sliderMaxIndex ? 'text-right' : 'text-center'"
            :style="{ left: dosageLabelPosition(index), transform: index === 0 ? 'translateX(0)' : index === sliderMaxIndex ? 'translateX(-100%)' : 'translateX(-50%)' }"
          >
            {{ opt.label }}
          </text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import {
  resolveWateringDoseOptions,
  resolveBottleOptionValue,
  isDoseOptionsUsingBucket
} from '@/utils/water-volume-format.js'

const props = defineProps({
  rows: { type: Array, default: () => [] },
  potVolumeMl: { type: Number, default: 0 }
})
const emit = defineEmits(['update-dose'])

const bottleOptions = computed(() => resolveWateringDoseOptions(props.potVolumeMl))
const useBucket = computed(() => isDoseOptionsUsingBucket(props.potVolumeMl))
const sliderMaxIndex = computed(() => Math.max(0, bottleOptions.value.length - 1))
const doseRefText = computed(() =>
  useBucket.value ? '以 5 升油桶为参照' : '以 550ml 矿泉水瓶为参照；喷一喷不计入根区浇水'
)

function doseLabel(amountMl) {
  const value = resolveBottleOptionValue(amountMl, bottleOptions.value)
  const opt = bottleOptions.value.find(o => o.value === value)
  return opt?.label || '不知道'
}

function doseOptionIndex(amountMl) {
  const optionValue = resolveBottleOptionValue(amountMl, bottleOptions.value)
  const index = bottleOptions.value.findIndex(option => option.value === optionValue)
  return index >= 0 ? index : 0
}

function dosageLabelPosition(index) {
  const max = sliderMaxIndex.value
  if (!Number.isFinite(max) || max <= 0) {return '0%'}
  const percent = (index / max) * 100
  return `${percent}%`
}

function onDoseSliderChange(date, event) {
  const raw = event?.detail?.value ?? event
  const index = Number(raw)
  const safeIndex =
    Number.isFinite(index) && index >= 0 && index <= sliderMaxIndex.value ? Math.round(index) : 0
  const option = bottleOptions.value[safeIndex] || bottleOptions.value[0]
  selectDose(date, option?.amountMl ?? null)
}

function selectDose(date, amountMl) {
  emit('update-dose', { date, amountMl })
}
</script>
