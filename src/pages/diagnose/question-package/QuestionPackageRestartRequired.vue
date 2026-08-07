<template>
  <view
    id="diagnose-question-package-restart-required"
    class="mx-4 mt-8 rounded-[20px] border border-[#f0d7a8] bg-[#fffaf0] p-5"
  >
    <text class="block text-lg font-bold text-[#4a3414]">题包已更新，请重新开始</text>
    <text class="mt-2 block text-sm leading-6 text-[#7a6034]">
      为保证这次问诊使用最新问题，请返回后重新开始。已完成的历史问诊不受影响。
    </text>
    <button
      id="diagnose-question-package-restart-required-button"
      class="mt-5 h-11 w-full rounded-xl bg-[#2d7a4f] p-0 text-sm font-bold leading-[44px] text-white"
      @click="$emit('restart')"
    >
      返回重新开始
    </button>
  </view>
</template>

<script setup>
defineEmits(['restart'])
</script>
