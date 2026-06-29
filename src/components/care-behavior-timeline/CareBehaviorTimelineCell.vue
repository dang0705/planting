<template>
  <view
    :id="`${idPrefix}-care-behavior-date-${item.date}`"
    :class="cellClass"
    hover-class="none"
    hover-stop-propagation
    style="-webkit-tap-highlight-color: transparent"
    @click="$emit('select', item)"
    @touchstart="$emit('press-start', item)"
    @touchend="$emit('press-end')"
    @touchcancel="$emit('press-end')"
    @mousedown="$emit('press-start', item)"
    @mouseup="$emit('press-end')"
    @mouseleave="$emit('press-end')"
  >
    <view class="care-behavior-day-wrap flex min-h-4 items-center justify-center gap-0.5">
      <text
        class="care-behavior-day text-sm font-medium leading-[1.1] text-[#0f172a]"
        :class="item.isToday ? 'care-behavior-day--today font-bold text-red-500' : ''"
      >
        {{ item.day }}
      </text>
    </view>

    <view
      class="care-behavior-metrics flex h-[30px] w-full flex-col justify-center gap-0 overflow-hidden"
    >
      <template v-if="item.hasWeatherMetrics">
        <CareBehaviorTimelineMetric
          v-if="item.temperatureText"
          icon-class="care-behavior-metric-icon--temp"
          :icon-src="temperatureIconSrc"
          :value="item.temperatureDisplayText"
        />
        <CareBehaviorTimelineMetric
          v-if="item.humidityText"
          icon-class="care-behavior-metric-icon--humidity"
          :icon-src="humidityIconSrc"
          :value="item.humidityDisplayText"
        />
      </template>
      <view v-else class="care-behavior-metrics-spacer h-[30px] w-full" />
    </view>

    <view class="care-behavior-dot-row flex min-h-2.5 items-center justify-center gap-[3px]">
      <CareBehaviorTimelineMarker
        :id="`${idPrefix}-care-behavior-water-${item.date}`"
        dot-class="care-behavior-dot--water bg-[#2b7fff]"
        :active="item.watering"
      />
      <CareBehaviorTimelineMarker
        :id="`${idPrefix}-care-behavior-fertilize-${item.date}`"
        dot-class="care-behavior-dot--fertilize bg-[#fe9a00]"
        :active="item.fertilizing"
      />
      <CareBehaviorTimelineMarker
        :id="`${idPrefix}-care-behavior-light-${item.date}`"
        dot-class="care-behavior-dot--light bg-[#22c55e] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.74)]"
        :active="item.lightChange"
      />
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { humidityIconSrc, temperatureIconSrc } from './icons.js'
import CareBehaviorTimelineMarker from './CareBehaviorTimelineMarker.vue'
import CareBehaviorTimelineMetric from './CareBehaviorTimelineMetric.vue'

defineEmits(['select', 'press-start', 'press-end'])
const props = defineProps({
  item: { type: Object, required: true },
  idPrefix: { type: String, default: 'diagnose' }
})

const cellClass = computed(() => [
  'care-behavior-cell',
  'box-border flex h-[75px] flex-col items-center justify-between overflow-hidden rounded-xl border border-[rgba(45,122,79,0.15)] bg-white px-0.5 pb-[5px] pt-1.5',
  props.item.isSelected
    ? 'care-behavior-cell--selected border-2 !border-[#2d7a4f] bg-[rgba(45,122,79,0.05)]'
    : '',
  props.item.isFuture
    ? 'care-behavior-cell--future border-[rgba(45,122,79,0.08)] bg-[rgba(241,248,244,0.5)] opacity-50'
    : '',
  props.item.isHistoricalOutOfRange
    ? 'care-behavior-cell--historical border-[rgba(45,122,79,0.08)] bg-[rgba(241,248,244,0.5)] opacity-50'
    : '',
  props.item.isToday ? 'care-behavior-cell--today' : '',
  props.item.canOpenDetail
    ? 'care-behavior-cell--selectable cursor-pointer'
    : 'care-behavior-cell--locked'
])
</script>
