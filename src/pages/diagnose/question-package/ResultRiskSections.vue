<template>
  <view>
    <view
      v-if="highRiskWarningText || blockedActionExplanations.length"
      :id="`${idPrefix}-risk-warning`"
      :class="riskClass"
    >
      <text class="block text-[15px] font-black text-gray-900">高危提醒</text>
      <text
        v-if="highRiskWarningText"
        class="mt-2 block whitespace-pre-line text-xs leading-relaxed text-gray-700"
        >{{ highRiskWarningText }}</text
      >
      <view
        v-if="useListWrapper && blockedActionExplanations.length"
        class="mt-2 flex flex-col gap-1.5"
      >
        <text
          v-for="item in blockedActionExplanations"
          :key="`blocked_${item.key}`"
          class="block whitespace-pre-line text-xs leading-relaxed text-gray-600"
        >
          {{ item.actionText ? `${item.actionText}：` : '' }}{{ item.explanation }}
        </text>
      </view>
      <text
        v-for="item in useListWrapper ? [] : blockedActionExplanations"
        :key="`blocked_plain_${item.key}`"
        class="mt-1.5 block whitespace-pre-line text-xs leading-relaxed text-gray-600"
      >
        {{ item.actionText ? `${item.actionText}：` : '' }}{{ item.explanation }}
      </text>
    </view>

    <view
      v-if="observationPeriodText"
      :id="`${idPrefix}-observation-period`"
      :class="observationClass"
    >
      <text class="block text-[15px] font-black text-gray-900">观察周期</text>
      <text class="mt-2 block whitespace-pre-line text-xs leading-relaxed text-gray-600">{{
        observationPeriodText
      }}</text>
    </view>
  </view>
</template>

<script setup>
defineProps({
  idPrefix: {
    type: String,
    required: true
  },
  highRiskWarningText: {
    type: String,
    default: ''
  },
  blockedActionExplanations: {
    type: Array,
    default: () => []
  },
  observationPeriodText: {
    type: String,
    default: ''
  },
  riskClass: {
    type: String,
    default: 'mt-3.5 rounded-[22px] bg-red-50 p-4'
  },
  observationClass: {
    type: String,
    default: 'mt-3.5 rounded-[22px] bg-white p-4'
  },
  useListWrapper: {
    type: Boolean,
    default: false
  }
})
</script>
