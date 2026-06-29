<template>
  <view
    :id="`${idPrefix}-care-behavior-timeline-${questionId}`"
    class="care-behavior-timeline mb-2.5 p-0"
  >
    <view
      v-if="loadingErrorText"
      class="care-behavior-error-banner mb-2 rounded-[10px] border border-[rgba(45,122,79,0.15)] bg-[rgba(248,250,249,0.96)] px-2.5 py-2"
    >
      <text class="care-behavior-error-text block text-xs leading-[18px] text-[#5a7a68]">
        {{ loadingErrorText }}
      </text>
    </view>

    <CareBehaviorTimelineGrid
      :cell-items="cellItems"
      :id-prefix="idPrefix"
      :show-loading-skeleton="showLoadingSkeleton"
      :selected-date-state="selectedDateState"
      :selected-date-label="selectedDateLabel"
      :selected-date-dialog-temperature-text="selectedDateDialogTemperatureText"
      :selected-date-dialog-humidity-text="selectedDateDialogHumidityText"
      :selected-date-behavior-status-text="selectedDateBehaviorStatusText"
      :selected-date-has-behavior="selectedDateHasBehavior"
      :selected-date-popover-style="selectedDatePopoverStyle"
      :selected-date-popover-arrow-style="selectedDatePopoverArrowStyle"
      @select-date="selectDate"
      @press-start="handleDatePressStart"
      @press-end="handleDatePressEnd"
      @reset-autohide="resetDatePopoverAutoHide"
    />

    <CareBehaviorTimelineLegend />
  </view>
</template>

<script setup>
import CareBehaviorTimelineGrid from './care-behavior-timeline/CareBehaviorTimelineGrid.vue'
import CareBehaviorTimelineLegend from './care-behavior-timeline/CareBehaviorTimelineLegend.vue'
import { useCareBehaviorTimeline } from './care-behavior-timeline/useCareBehaviorTimeline.js'

const props = defineProps({
  error: { type: [String, Object], default: '' },
  loading: { type: Boolean, default: false },
  question: { type: Object, default: () => ({}) },
  questionId: { type: String, default: '' },
  timeline: { type: Object, default: () => ({}) },
  idPrefix: { type: String, default: 'diagnose' }
})
const emit = defineEmits(['change'])

const {
  cellItems,
  loadingErrorText,
  selectedDateBehaviorStatusText,
  selectedDateDialogHumidityText,
  selectedDateDialogTemperatureText,
  selectedDateHasBehavior,
  selectedDateLabel,
  selectedDatePopoverArrowStyle,
  selectedDatePopoverStyle,
  selectedDateState,
  showLoadingSkeleton,
  handleDatePressEnd,
  handleDatePressStart,
  resetDatePopoverAutoHide,
  selectDate
} = useCareBehaviorTimeline(props, emit)
</script>
