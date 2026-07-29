<template>
  <view
    class="fixed left-0 right-0 top-0 z-[999]"
    :style="{
      paddingTop: statusBarHeight + 'px',
      background: 'linear-gradient(135deg, #2D7A4F 0%, #52B788 100%)'
    }"
  >
    <view class="relative flex h-[44px] items-center px-4">
      <view v-if="showBack" class="flex w-8 items-center" @click="goBack">
        <text class="text-[32px] font-light leading-none text-white">‹</text>
      </view>
      <view v-else class="w-8" />

      <HeaderWeatherInfo class="ml-2 flex-1" />

      <view class="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <text class="text-base font-semibold text-white">{{ title }}</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import HeaderWeatherInfo from './HeaderWeatherInfo.vue'

defineProps({
  showBack: { type: Boolean, default: false },
  title: { type: String, default: '' }
})

const statusBarHeight = ref(0)

onMounted(() => {
  const systemInfo = uni.getSystemInfoSync()
  statusBarHeight.value = systemInfo.statusBarHeight || 0
})

function goBack() {
  uni.navigateBack()
}
</script>
