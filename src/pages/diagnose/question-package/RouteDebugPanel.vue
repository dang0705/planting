<template>
  <view
    v-if="show"
    id="diagnose-question-package-debug-panel"
    class="mt-3.5 rounded-[22px] border border-[#e7e0d1] bg-[#fffdf8] p-4 shadow-sm"
  >
    <text class="block text-[15px] font-black text-gray-900">决策详情</text>
    <view class="mt-3 flex flex-col gap-2">
      <text v-if="summaryText" class="block text-xs leading-relaxed text-gray-600"
        >决策原因：{{ summaryText }}</text
      >
      <text v-if="modeText" class="block text-xs leading-relaxed text-gray-600"
        >模式：{{ modeText }}</text
      >
      <text v-if="visibleOutcomeText" class="block text-xs leading-relaxed text-gray-600"
        >展示结果：{{ visibleOutcomeText }}</text
      >
      <text v-if="nextQuestionText" class="block text-xs leading-relaxed text-gray-600"
        >下一步问题：{{ nextQuestionText }}</text
      >
      <text v-if="groupText" class="block text-xs leading-relaxed text-gray-600"
        >命中流程组：{{ groupText }}</text
      >
      <text v-if="fallbackPolicy" class="block text-xs leading-relaxed text-gray-600"
        >回退策略：{{ fallbackPolicy }}</text
      >
    </view>
  </view>
</template>

<script setup>
defineProps({
  show: Boolean,
  summaryText: { type: String, default: '' },
  modeText: { type: String, default: '' },
  visibleOutcomeText: { type: String, default: '' },
  nextQuestionText: { type: String, default: '' },
  groupText: { type: String, default: '' },
  fallbackPolicy: { type: String, default: '' }
})
</script>
