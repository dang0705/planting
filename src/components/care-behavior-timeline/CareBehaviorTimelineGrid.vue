<template>
  <view
    class="care-behavior-calendar-card relative box-border rounded-xl bg-white pt-5 shadow-[0_1px_0_rgba(45,122,79,0.02)]"
    :class="sticky ? 'sticky top-0 z-10' : ''"
  >
    <view class="care-behavior-weekday-header mb-0.5 grid grid-cols-7 gap-[3px]">
      <text
        v-for="day in weekLabels"
        :key="day"
        class="care-behavior-weekday-item text-center text-xs leading-4 text-[#5a7a68]"
      >
        {{ day }}
      </text>
    </view>

    <view class="care-behavior-grid-stage relative overflow-visible">
      <CareBehaviorTimelineSkeleton
        v-if="showLoadingSkeleton"
        :id="`${idPrefix}-care-behavior-skeleton`"
        :items="skeletonCellItems"
      />
      <view v-else class="care-behavior-grid grid grid-cols-7 gap-1">
        <CareBehaviorTimelineCell
          v-for="item in cellItems"
          :key="item.date"
          :item="item"
          :id-prefix="idPrefix"
          @select="$emit('select-date', $event)"
          @press-start="$emit('press-start', $event)"
          @press-end="$emit('press-end')"
        />
      </view>

      <CareBehaviorTimelinePopover
        :state="selectedDateState"
        :date-label="selectedDateLabel"
        :temperature-text="selectedDateDialogTemperatureText"
        :humidity-text="selectedDateDialogHumidityText"
        :behavior-status-text="selectedDateBehaviorStatusText"
        :has-behavior="selectedDateHasBehavior"
        :popover-style="selectedDatePopoverStyle"
        :arrow-style="selectedDatePopoverArrowStyle"
        :id-prefix="idPrefix"
        @reset-autohide="$emit('reset-autohide')"
      />
    </view>
  </view>
</template>

<script setup>
import CareBehaviorTimelineCell from './CareBehaviorTimelineCell.vue'
import CareBehaviorTimelinePopover from './CareBehaviorTimelinePopover.vue'
import CareBehaviorTimelineSkeleton from './CareBehaviorTimelineSkeleton.vue'

defineEmits(['press-end', 'press-start', 'reset-autohide', 'select-date'])
defineProps({
  cellItems: { type: Array, default: () => [] },
  idPrefix: { type: String, default: 'diagnose' },
  sticky: { type: Boolean, default: false },
  selectedDateBehaviorStatusText: { type: String, default: '' },
  selectedDateDialogHumidityText: { type: String, default: '—' },
  selectedDateDialogTemperatureText: { type: String, default: '—' },
  selectedDateHasBehavior: { type: Boolean, default: false },
  selectedDateLabel: { type: String, default: '' },
  selectedDatePopoverArrowStyle: { type: Object, default: () => ({}) },
  selectedDatePopoverStyle: { type: Object, default: () => ({}) },
  selectedDateState: { type: Object, default: null },
  showLoadingSkeleton: { type: Boolean, default: false }
})

const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const weekLabels = WEEKDAY_LABELS

const skeletonCellItems = Array.from({ length: 21 }, (_, index) => index)
</script>
