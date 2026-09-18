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
      <text
        v-if="amountBottleText"
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
    <WateringSoilVisualDecision
      v-if="visualSoilEvidence"
      result-label="盆土综合判断"
      action-label="浇水建议"
      :result-text="soilDecision.resultText"
      :action-text="soilDecision.actionText"
    />
  </view>
</template>

<script setup>
import { computed } from 'vue'
import WateringSoilVisualDecision from '@/components/watering/WateringSoilVisualDecision.vue'
import { buildWateringSoilDecision } from '@/utils/watering-soil-decision.js'

const props = defineProps({
  isOverWateringBlocked: { type: Boolean, default: false },
  isOverdue: { type: Boolean, default: false },
  nextWaterDisplay: { type: String, default: '' },
  amountBottleText: { type: String, default: '' },
  potProfileState: { type: String, default: 'missing' },
  soilCheckMessage: { type: String, default: '' },
  visualSoilEvidence: { type: Object, default: null },
  wateringContext: { type: String, default: '' },
  wateringAction: { type: String, default: '' }
})

const soilDecision = computed(() =>
  buildWateringSoilDecision({
    visualSoilEvidence: props.visualSoilEvidence,
    soilCheck: { message: props.soilCheckMessage },
    wateringContext: props.wateringContext || (props.isOverWateringBlocked ? 'likely_too_wet' : ''),
    wateringAction: props.wateringAction
  })
)
</script>
