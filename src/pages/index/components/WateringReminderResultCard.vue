<template>
  <view
    class="mt-3 rounded-[14px] border p-4"
    :class="
      isOverWateringBlocked ? 'border-[#f2d99a] bg-[#fff3e0]' : 'border-[#d7e6dc] bg-[#f8faf9]'
    "
  >
    <text class="block text-[12px] text-[#5a7868]">
      {{ isOverWateringBlocked ? '过浇警示' : isOverdue ? '已逾期' : '建议下次浇水' }}
    </text>
    <view class="mt-1 flex items-center justify-between">
      <text
        class="text-[20px] font-semibold"
        :class="isOverWateringBlocked ? 'text-[#e65100]' : 'text-[#1d2a23]'"
      >
        {{ nextWaterDisplay }}
      </text>
    </view>
    <view class="mt-3 flex items-center justify-between">
      <text class="text-[12px] text-[#5a7868]">大概浇多少</text>
      <text v-if="isOverWateringBlocked" class="text-[13px] font-medium text-[#1d2a23]">
        近期先不浇
      </text>
      <text v-else-if="amountBottleText" class="text-[13px] font-medium text-[#1d2a23]">
        {{ amountBottleText }}
      </text>
      <text
        v-else-if="potProfileState !== 'complete'"
        id="watering-reminder-pot-profile-benefit"
        class="text-[13px] font-medium text-[#1d2a23]"
      >
        补充盆型后显示水量范围
      </text>
      <text v-else class="text-[13px] font-medium text-[#1d2a23]">暂不提供固定水量</text>
    </view>
    <text
      v-if="plannerEvidenceText"
      id="watering-reminder-planner-evidence"
      class="mt-2 block text-[12px] text-[#5a7868]"
    >
      {{ plannerEvidenceText }}
    </text>
    <view v-if="nextWaterReason" class="mt-3">
      <text class="block text-[12px] font-semibold text-[#5a7868]">为什么这样建议</text>
      <text class="mt-1 block text-[12px] leading-5 text-[#5a7868]">
        {{ nextWaterReason }}
      </text>
    </view>
    <view
      v-if="soilCheckMessage"
      id="watering-reminder-soil-check-guidance"
      class="mt-3 rounded-xl border border-[#d7e6dc] bg-white px-3 py-2"
    >
      <text class="block text-[12px] font-semibold text-[#2d7a4f]">浇水前先看盆土</text>
      <text class="mt-1 block text-[12px] leading-5 text-[#5a7868]">
        {{ soilCheckMessage }}
      </text>
    </view>
    <view v-if="plannerSummaryRows.length" class="mt-2 border-t border-gray-200/50 pt-2">
      <view
        v-for="row in plannerSummaryRows"
        :key="row.label"
        class="flex items-center justify-between"
      >
        <text class="text-xs text-gray-500">{{ row.label }}</text>
        <text :class="row.valueClass">{{ row.value }}</text>
      </view>
    </view>
    <view v-if="reasonCodes.length" class="mt-2 flex flex-wrap gap-1">
      <text
        v-for="code in reasonCodes"
        :key="code"
        v-show="reasonCodeLabel(code)"
        class="rounded-full bg-white/60 px-2 py-0.5 text-[10px] text-gray-500"
      >
        {{ reasonCodeLabel(code) }}
      </text>
    </view>
  </view>
</template>

<script setup>
import { reasonCodeLabel } from './watering-reminder-options.js'

defineProps({
  isOverWateringBlocked: { type: Boolean, default: false },
  isOverdue: { type: Boolean, default: false },
  nextWaterDisplay: { type: String, default: '' },
  nextWaterReason: { type: String, default: '' },
  amountBottleText: { type: String, default: '' },
  potProfileState: { type: String, default: 'missing' },
  plannerEvidenceText: { type: String, default: '' },
  soilCheckMessage: { type: String, default: '' },
  plannerSummaryRows: { type: Array, default: () => [] },
  reasonCodes: { type: Array, default: () => [] }
})
</script>
