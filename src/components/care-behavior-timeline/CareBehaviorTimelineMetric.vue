<template>
  <view class="care-behavior-metric flex h-[15px] min-w-0 items-center justify-center gap-0.5 overflow-hidden leading-[15px]">
    <view
      class="care-behavior-metric-icon relative h-[10px] w-[10px] shrink-0 text-[#5a7a68]"
      :class="iconClass"
      aria-hidden="true"
    >
      <image
        class="care-behavior-metric-icon-svg block h-full w-full"
        :src="iconSrc"
        mode="aspectFit"
        aria-hidden="true"
      />
    </view>
    <text class="care-behavior-metric-value min-w-0 max-w-[28px] shrink overflow-hidden whitespace-nowrap text-[10px] font-medium leading-[15px] text-[#5a7a68]">
      {{ value }}
    </text>
  </view>
</template>

<script setup>
defineProps({
  iconClass: { type: String, default: '' },
  iconSrc: { type: String, required: true },
  value: { type: String, default: '' }
})
</script>
