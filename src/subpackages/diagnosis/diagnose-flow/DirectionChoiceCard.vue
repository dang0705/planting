<template>
  <view id="diagnose-direction-choice-card" class="mb-3">
    <text class="block text-sm font-semibold text-gray-900 mb-2">可选方向</text>
    <view class="rounded-xl bg-[#F8F6F0] p-3">
      <text class="block text-[11px] text-gray-500 mb-2">
        图片里发现多个可能方向，建议先处理推荐项。
      </text>
      <view
        v-for="choice in directionChoices"
        :key="choice.modeKey || choice.problemKey"
        :id="`diagnose-direction-choice-${choice.modeKey || choice.directionKey || choice.problemKey}`"
        class="mb-2 last:mb-0 rounded-xl px-3 py-2"
        :class="isRecommended(choice) ? 'border border-[#2D6A4F] bg-[#F3FAF5]' : 'bg-white'"
        @click="$emit('choose', choice)"
      >
        <text
          v-if="isRecommended(choice)"
          class="mb-1 block text-[10px] font-semibold text-[#2D6A4F]"
        >
          推荐
        </text>
        <text class="block text-xs font-semibold text-[#2D6A4F]">
          {{ choice.userDisplayName || choice.modeKey || choice.problemKey }}
        </text>
      </view>
    </view>
  </view>
</template>

<script>
export default {
  props: {
    directionChoices: { type: Array, default: () => [] },
    recommendedDirection: { type: String, default: '' }
  },
  emits: ['choose'],
  methods: {
    isRecommended(choice) {
      return Boolean(choice?.recommended || this.recommendedDirection === choice?.modeKey)
    }
  }
}
</script>
