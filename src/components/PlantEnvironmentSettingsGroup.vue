<template>
  <view
    :id="`${idPrefix}-group`"
    class="mb-5 rounded-2xl border border-[rgba(45,122,79,0.15)] bg-white p-4"
  >
    <view class="mb-3">
      <text class="block text-base font-semibold text-[#1f2937]">环境条件</text>
      <text class="mt-1 block text-xs leading-5 text-[#6b7280]">
        光照和空气会影响植物的实际生长状态
      </text>
    </view>

    <button
      :id="`${idPrefix}-light-entry`"
      class="m-0 flex w-full items-center gap-3 rounded-xl bg-[#f8faf9] px-3 py-3 text-left"
      @click="emit('open', 'light')"
    >
      <view class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#fff8e1]">
        <text class="text-xl">☀️</text>
      </view>
      <view class="min-w-0 flex-1">
        <text class="block text-sm font-semibold text-[#1f2937]">光照环境</text>
        <text
          :id="`${idPrefix}-light-status`"
          class="mt-1 block truncate text-xs leading-5 text-[#6b7280]"
        >
          {{ lightSummary }}
        </text>
      </view>
      <text class="shrink-0 text-xl leading-none text-[#8b9a91]">›</text>
    </button>

    <view class="my-2 h-px bg-[#edf2ee]" />

    <button
      :id="`${idPrefix}-air-entry`"
      class="m-0 flex w-full items-center gap-3 rounded-xl bg-[#f8faf9] px-3 py-3 text-left"
      @click="emit('open', 'air')"
    >
      <view class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e8f5e9]">
        <text class="text-xl">💨</text>
      </view>
      <view class="min-w-0 flex-1">
        <text class="block text-sm font-semibold text-[#1f2937]">空气环境</text>
        <text
          :id="`${idPrefix}-air-status`"
          class="mt-1 block truncate text-xs leading-5 text-[#6b7280]"
        >
          {{ airSummary }}
        </text>
      </view>
      <text class="shrink-0 text-xl leading-none text-[#8b9a91]">›</text>
    </button>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import {
  describeAirEnvironmentInput,
  isAirEnvironmentAnswerReady
} from '@/utils/air-environment.js'
import { describeLightEnvironment } from '@/utils/light-environment.js'

const props = defineProps({
  plant: { type: Object, default: null },
  idPrefix: { type: String, default: 'plant-environment' }
})
const emit = defineEmits(['open'])

const lightSummary = computed(() => {
  return describeLightEnvironment(props.plant?.lightEnvironment)
})

const airSummary = computed(() => {
  const value = props.plant?.airEnvironment?.input || props.plant?.airEnvironment
  if (!isAirEnvironmentAnswerReady(value)) {
    return '点击查看或设置当前空气环境'
  }
  return describeAirEnvironmentInput(value)
})
</script>
