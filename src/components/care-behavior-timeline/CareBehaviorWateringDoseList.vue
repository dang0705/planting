<template>
  <view v-if="rows.length" class="care-dose-list mt-3 rounded-[12px] border border-gray-100 bg-white p-3">
    <text class="block text-sm font-medium text-gray-900">每次浇了多少水？</text>
    <text class="mt-0.5 block text-xs text-gray-400">以 550ml 矿泉水瓶为参照；喷一喷不计入根区浇水</text>
    <view v-for="row in rows" :key="row.date" class="mt-3">
      <view class="flex items-center justify-between">
        <text class="text-xs font-medium text-gray-700">{{ row.date }}</text>
        <text class="text-[10px] text-[#2f8f57]">{{ doseLabel(row.amountMl) }}</text>
      </view>
      <view class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <view
          v-for="opt in bottleOptions"
          :key="opt.label"
          class="flex flex-col items-center"
          @click="selectDose(row.date, opt.amountMl)"
        >
          <view
            class="flex items-center justify-center rounded-full"
            :class="isSelected(row.amountMl, opt.amountMl) ? 'size-5 bg-[#2f8f57]' : 'size-3 bg-gray-200'"
          >
            <view v-if="isSelected(row.amountMl, opt.amountMl)" class="size-2 rounded-full bg-white" />
          </view>
          <text
            class="mt-1 text-[10px]"
            :class="isSelected(row.amountMl, opt.amountMl) ? 'text-[#2f8f57] font-medium' : 'text-gray-400'"
          >{{ opt.label }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { resolveWateringDoseOptions, resolveBottleOptionValue } from '@/utils/water-volume-format.js'

const props = defineProps({
  rows: { type: Array, default: () => [] },
  potVolumeMl: { type: Number, default: 0 }
})
const emit = defineEmits(['update-dose'])

const bottleOptions = computed(() => resolveWateringDoseOptions(props.potVolumeMl))

function doseLabel(amountMl) {
  const value = resolveBottleOptionValue(amountMl, bottleOptions.value)
  const opt = bottleOptions.value.find(o => o.value === value)
  return opt?.label || '不知道'
}

function isSelected(rowAmountMl, optAmountMl) {
  if (optAmountMl === null) {
    return rowAmountMl === null || rowAmountMl === undefined
  }
  return resolveBottleOptionValue(rowAmountMl, bottleOptions.value) === resolveBottleOptionValue(optAmountMl, bottleOptions.value)
}

function selectDose(date, amountMl) {
  emit('update-dose', { date, amountMl })
}
</script>
