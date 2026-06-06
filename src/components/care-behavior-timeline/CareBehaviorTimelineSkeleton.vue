<template>
  <view
    class="care-behavior-grid-skeleton grid grid-cols-7 gap-1"
    aria-hidden="true"
  >
    <view
      v-for="item in items"
      :key="item"
      class="care-behavior-skeleton-cell box-border flex h-[75px] flex-col items-center justify-between overflow-hidden rounded-xl border border-[rgba(45,122,79,0.12)] bg-[linear-gradient(90deg,rgba(241,248,244,0.72),rgba(248,250,249,0.92),rgba(241,248,244,0.72))] px-1 pb-[5px] pt-1.5"
    >
      <view class="care-behavior-skeleton-day h-2.5 w-4 rounded-full bg-[rgba(90,122,104,0.14)]" />
      <view class="care-behavior-skeleton-metric h-[7px] w-[26px] rounded-full bg-[rgba(90,122,104,0.14)]" />
      <view class="care-behavior-skeleton-metric care-behavior-skeleton-metric--two h-[7px] w-[22px] rounded-full bg-[rgba(90,122,104,0.14)]" />
      <view class="care-behavior-skeleton-dot-row flex items-center gap-[3px] bg-transparent p-0">
        <view class="care-behavior-skeleton-dot h-1.5 w-1.5 rounded-full bg-[rgba(90,122,104,0.14)]" />
        <view class="care-behavior-skeleton-dot h-1.5 w-1.5 rounded-full bg-[rgba(90,122,104,0.14)]" />
        <view class="care-behavior-skeleton-dot h-1.5 w-1.5 rounded-full bg-[rgba(90,122,104,0.14)]" />
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
