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
      <text class="text-[12px] text-[#5a7868]">浇水量</text>
      <text v-if="isOverWateringBlocked" class="text-[13px] font-medium text-[#1d2a23]">
        近期先不浇
      </text>
      <text
        v-else-if="amountBottleText"
        id="watering-reminder-result-amount"
        class="text-[13px] font-medium text-[#1d2a23]"
      >
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
    <view
      v-if="soilCheckMessage"
      id="watering-reminder-soil-check-guidance"
      class="mt-3 rounded-xl border border-[#d7e6dc] bg-white px-3 py-2"
    >
      <text class="block text-[12px] leading-5 text-[#2d7a4f]">
        {{ compactSoilCheckMessage(soilCheckMessage) }}
      </text>
    </view>
  </view>
</template>

<script setup>
function compactSoilCheckMessage(message) {
  const detail = String(message || '')
    .trim()
    .replace(/^下次浇水前先检查盆土[，,]\s*/, '')
    .replace(/^建议现在检查盆土[，,]\s*/, '')
    .replace(/^先检查盆土[，,]\s*/, '')
  return detail ? `浇水前摸一下盆土，${detail}` : '浇水前摸一下盆土。'
}

defineProps({
  isOverWateringBlocked: { type: Boolean, default: false },
  isOverdue: { type: Boolean, default: false },
  nextWaterDisplay: { type: String, default: '' },
  amountBottleText: { type: String, default: '' },
  potProfileState: { type: String, default: 'missing' },
  soilCheckMessage: { type: String, default: '' }
})
</script>
