<template>
  <view
    id="fertilization-reminder-calculation-tooltip-dismiss-layer"
    class="fixed inset-0 z-[80]"
    @click="close"
  >
    <view
      id="fertilization-reminder-calculation-tooltip"
      class="absolute left-4 right-4 bottom-[180px] rounded-xl border border-[#D7E6DC] bg-white px-3 py-2.5 shadow-[0_10px_24px_rgba(15,23,42,0.12)]"
      @click.stop
    >
      <text class="block text-xs font-semibold leading-5 text-[#1F2933]">提醒日期怎么来的？</text>
      <text class="mt-1 block text-xs leading-5 text-[#53645A]">{{ guidance }}</text>
      <text class="mt-1 block text-[11px] leading-4 text-[#667085]">
        这是检查提醒，不代表当天一定要施肥；到期后请先查看当月规则。
      </text>
    </view>
  </view>
</template>

<script setup>
defineProps({
  guidance: { type: String, default: '' }
})

const emit = defineEmits(['close'])

function close() {
  emit('close')
}
</script>
