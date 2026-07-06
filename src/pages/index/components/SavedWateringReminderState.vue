<template>
  <view
    id="watering-reminder-saved-state"
    class="mt-3 rounded-[14px] border border-[#b7e4c7] bg-[#f0fdf4] p-4"
  >
    <view class="flex items-center justify-between">
      <text class="text-[13px] font-semibold text-[#166534]">已添加到手机日历</text>
      <text id="watering-reminder-saved-created-at" class="text-[11px] text-[#5b7b68]">
        {{ display.createdText }}
      </text>
    </view>
    <text id="watering-reminder-saved-next-time" class="mt-1 block text-[13px] text-[#2f5f44]">
      {{ display.nextText }}
    </text>
    <text
      v-if="display.reasonText"
      id="watering-reminder-saved-reason"
      class="mt-1 block text-[12px] leading-5 text-[#5b7b68]"
    >
      {{ display.reasonText }}
    </text>
  </view>
</template>

<script setup>
defineProps({
  display: { type: Object, default: () => ({ createdText: '', nextText: '', reasonText: '' }) }
})
</script>
