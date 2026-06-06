<template>
  <view
    v-if="state"
    class="care-behavior-detail-popover absolute z-[5] w-[95px] max-w-[320px]"
    :style="popoverStyle"
    @click="$emit('reset-autohide')"
  >
    <view
      class="care-behavior-detail-popover-arrow absolute top-[-5px] -translate-x-1/2"
      :style="arrowStyle"
    />
    <view class="care-behavior-detail-popover-card relative box-border w-[95px] overflow-hidden rounded-xl border border-[rgba(45,122,79,0.15)] bg-white px-[13px] py-[9px] shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
      <text class="care-behavior-detail-date block whitespace-nowrap text-base font-medium leading-6 text-[#0f172a]">
        {{ dateLabel }}
      </text>
      <view class="care-behavior-detail-body flex flex-col pt-1">
        <text class="care-behavior-detail-row block whitespace-nowrap pt-1 text-sm leading-5 text-[#0f172a]">
          温度: {{ temperatureText }}
        </text>
        <text class="care-behavior-detail-row block whitespace-nowrap pt-1 text-sm leading-5 text-[#0f172a]">
          湿度: {{ humidityText }}
        </text>
        <text
          :id="`diagnose-care-behavior-action-water-${state.date}`"
          class="care-behavior-detail-status block whitespace-nowrap pt-1 text-sm leading-5 text-slate-400"
          :class="{
            'text-[#51a2ff]': hasBehavior,
            'opacity-[0.58]': !state.isSelectable
          }"
        >
          {{ behaviorStatusText }}
        </text>
      </view>
    </view>
  </view>
</template>

<script setup>
defineEmits(['reset-autohide'])
defineProps({
  arrowStyle: { type: Object, default: () => ({}) },
  behaviorStatusText: { type: String, default: '' },
  dateLabel: { type: String, default: '' },
  hasBehavior: { type: Boolean, default: false },
  humidityText: { type: String, default: '—' },
  popoverStyle: { type: Object, default: () => ({}) },
  state: { type: Object, default: null },
  temperatureText: { type: String, default: '—' }
})
</script>

<style scoped>
.care-behavior-detail-popover-arrow {
  width: 0;
  height: 0;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-bottom: 5px solid #ffffff;
  filter: drop-shadow(0 -1px 1px rgba(45, 122, 79, 0.08));
}
</style>
