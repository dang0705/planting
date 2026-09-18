<template>
  <view class="mb-3 px-4">
    <text class="block text-xl font-extrabold leading-snug text-gray-900">{{ title }}</text>
    <text class="mt-2 block text-sm font-semibold leading-5 text-[#5a7a68]">{{ progress }}</text>
  </view>
</template>

<script setup>
defineProps({ title: { type: String, default: '' }, progress: { type: String, default: '' } })
</script>
