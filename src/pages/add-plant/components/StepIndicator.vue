<template>
  <view class="flex items-center justify-center py-6 px-10 bg-white">
    <view class="flex flex-col items-center">
      <view class="w-9 h-9 rounded-full flex items-center justify-center mb-2 transition-all duration-300"
            :class="step > 1 ? 'bg-[#52B788]' : 'bg-primary'">
        <text class="text-white text-sm font-semibold">{{ step > 1 ? '✓' : '1' }}</text>
      </view>
      <text class="text-xs text-primary font-semibold">选择植物</text>
    </view>
    <view class="w-[60px] h-0.5 mx-3 mb-6 transition-all duration-300"
          :class="step >= 2 ? 'bg-primary' : 'bg-gray-300'"></view>
    <view class="flex flex-col items-center">
      <view class="w-9 h-9 rounded-full flex items-center justify-center mb-2 transition-all duration-300"
            :class="step >= 2 ? 'bg-primary' : 'bg-gray-300'">
        <text class="text-white text-sm font-semibold">2</text>
      </view>
      <text class="text-xs" :class="step >= 2 ? 'text-primary font-semibold' : 'text-gray-400'">填写信息</text>
    </view>
  </view>
</template>

<script setup>
defineProps({ step: { type: Number, default: 1 } });
</script>
