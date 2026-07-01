<template>
  <view v-if="rows.length" class="care-dose-list mt-3 rounded-[12px] border border-gray-100 bg-white p-3">
    <text class="block text-sm font-medium text-gray-900">每次浇了多少水？</text>
    <text class="mt-0.5 block text-xs text-gray-400">喷雾不计入根区浇水，浇透会提高过浇风险</text>
    <view v-for="row in rows" :key="row.date" class="mt-3">
      <view class="flex items-center justify-between">
        <text class="text-xs font-medium text-gray-700">{{ row.date }}</text>
        <text class="text-[10px] text-[#2f8f57]">{{ doseLabel(row.amount) }}</text>
      </view>
      <view class="mt-2 flex items-center justify-between">
        <view
          v-for="opt in doseOptions"
          :key="opt.value"
          class="flex flex-col items-center"
          @click="selectDose(row.date, opt.value)"
        >
          <view
            class="flex items-center justify-center rounded-full"
            :class="row.amount === opt.value ? 'size-5 bg-[#2f8f57]' : 'size-3 bg-gray-200'"
          >
            <view v-if="row.amount === opt.value" class="size-2 rounded-full bg-white" />
          </view>
          <text
            class="mt-1 text-[10px]"
            :class="row.amount === opt.value ? 'text-[#2f8f57] font-medium' : 'text-gray-400'"
          >{{ opt.label }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
defineProps({
  rows: { type: Array, default: () => [] }
})
const emit = defineEmits(['update-dose'])

const doseOptions = [
  { label: '不知道', value: 'unknown' },
  { label: '喷雾', value: 'mist' },
  { label: '少量', value: 'small' },
  { label: '普通', value: 'normal' },
  { label: '浇透', value: 'thorough' }
]

function doseLabel(value) {
  return doseOptions.find(o => o.value === value)?.label || '普通'
}

function selectDose(date, value) {
  emit('update-dose', { date, amount: value })
}
</script>
