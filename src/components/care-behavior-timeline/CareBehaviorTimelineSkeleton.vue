<template>
  <view
    class="grid grid-cols-7 gap-1"
    aria-hidden="true"
  >
    <view
      v-for="item in items"
      :key="item"
      class="care-behavior-skeleton-cell box-border flex h-[75px] flex-col items-center justify-between overflow-hidden rounded-xl border border-[#2d7a4f1f] bg-[#f1f8f4] px-1 pb-[5px] pt-1.5"
    >
      <view class="h-2.5 w-4 rounded-full bg-[#5a7a6829]" />
      <view class="h-[7px] w-[26px] rounded-full bg-[#5a7a6829]" />
      <view class="h-[7px] w-[22px] rounded-full bg-[#5a7a6829]" />
      <view class="flex items-center gap-[3px] bg-transparent p-0">
        <view class="h-1.5 w-1.5 rounded-full bg-[#5a7a6829]" />
        <view class="h-1.5 w-1.5 rounded-full bg-[#5a7a6829]" />
        <view class="h-1.5 w-1.5 rounded-full bg-[#5a7a6829]" />
      </view>
    </view>
  </view>
</template>

<script setup>
defineProps({
  items: { type: Array, default: () => [] }
})
</script>

<style scoped>
.care-behavior-skeleton-cell {
  animation: careBehaviorPulse 1.2s ease-in-out infinite;
}

@keyframes careBehaviorPulse {
  0%,
  100% {
    opacity: 0.72;
  }
  50% {
    opacity: 1;
  }
}
</style>
