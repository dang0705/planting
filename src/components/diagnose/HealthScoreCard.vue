<template>
  <view class="bg-gray-50 rounded-xl p-3">
    <view class="flex items-center justify-between mb-2">
      <text class="text-xs font-semibold text-gray-600">健康评分</text>
      <view class="px-2 py-0.5 rounded-full text-xs font-bold" :class="statusClass">
        {{ statusText }}
      </view>
    </view>
    <view class="flex items-end gap-1 mb-2">
      <text class="text-3xl font-bold text-primary">{{ score }}</text>
      <text class="text-gray-400 text-xs mb-1">/ 100</text>
    </view>
    <view class="w-full bg-gray-200 rounded-full h-1.5">
      <view class="h-1.5 rounded-full" :class="barClass" :style="{ width: score + '%' }" />
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  score: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    default: 'healthy'
  }
})

const statusClass = computed(() => {
  if (props.status === 'sick') return 'bg-red-100 text-red-600'
  if (props.status === 'warning') return 'bg-yellow-100 text-yellow-600'
  return 'bg-green-100 text-green-600'
})

const statusText = computed(() => {
  if (props.status === 'sick') return '需要治疗'
  if (props.status === 'warning') return '轻微问题'
  return '状态良好'
})

const barClass = computed(() => {
  if (props.status === 'sick') return 'bg-red-400'
  if (props.status === 'warning') return 'bg-yellow-400'
  return 'bg-green-400'
})
</script>
