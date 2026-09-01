<template>
  <view
    class="h-[129px] w-full overflow-hidden rounded-[12px] border border-[rgba(45,122,79,0.15)] bg-white p-px shadow-[0_1px_3px_rgba(0,0,0,0.1),0_1px_2px_-1px_rgba(0,0,0,0.1)]"
  >
    <view class="flex h-[127px] w-full overflow-hidden rounded-[11px]">
      <view
        :id="`index-plant-card-edit-${plant.id}`"
        class="h-[127px] w-[112px] flex-[0_0_112px]"
        @click.stop="$emit('edit', plant)"
      >
        <PlantDisplayBase :plant="plant" container-class="h-full w-full rounded-none" />
      </view>

      <view class="flex h-[127px] min-w-0 flex-1 flex-col gap-2 p-3">
        <view class="flex h-[27px] items-center gap-1.5">
          <PlantProfileCompleteness :plant="plant" @click="$emit('edit', plant)" />
          <text
            class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[18px] font-medium leading-[27px] text-[#0a0a0a]"
          >
            {{ plant.displayName }}
          </text>
        </view>

        <view class="flex h-[22px] items-center gap-1.5">
          <view
            class="inline-flex h-[22px] items-center justify-center rounded-full border px-[9px] py-[3px] text-xs font-normal leading-4"
            :class="healthPresentation.className"
          >
            <text>{{ healthPresentation.label }}</text>
          </view>
          <view
            v-if="needsWatering"
            class="inline-flex h-[22px] items-center justify-center rounded-full border border-[#b8e6fe] bg-[#dff2fe] px-[9px] py-[3px] text-xs font-normal leading-4 text-[#0069a8]"
          >
            <text>需浇水</text>
          </view>
        </view>

        <view class="flex h-[38px] min-w-0 w-full items-center gap-2">
          <button
            :id="`diagnose-entry-button-${plant.id}`"
            class="m-0 box-border flex h-9 min-w-0 w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] border-0 bg-[#2d7a4f] px-3 py-2 text-sm font-medium leading-5 text-white after:border-0"
            hover-class="none"
            @click.stop="$emit('diagnose', plant)"
          >
            <image :src="diagnoseIcon" class="!size-4 flex-[0_0_16px]" mode="aspectFit" />
            <text>诊断</text>
          </button>
          <button
            :id="`index-plant-card-history-${plant.id}`"
            class="m-0 box-border flex h-9 min-w-0 w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] border border-solid border-primary bg-white px-3 py-2 text-sm font-medium leading-5 text-[#0a0a0a] after:border-0"
            hover-class="none"
            @click.stop="$emit('history', plant)"
          >
            <image :src="historyIcon" class="!size-4 flex-[0_0_16px]" mode="aspectFit" />
            <text>历史</text>
          </button>
        </view>
      </view>

      <view
        class="flex h-[127px] w-[49px] flex-[0_0_49px] flex-col items-center justify-center gap-2 border-l border-[rgba(45,122,79,0.15)] py-3 pl-[9px] pr-2"
      >
        <view class="flex flex-col items-center gap-0.5">
          <button
            :id="`plant-card-reminder-${plant.id}-water`"
            class="m-0 box-border flex min-w-0 size-8 items-center justify-center rounded-full border p-0 after:border-0"
            :class="
              waterReminderActive
                ? 'border-[#74d4ff] bg-[#f0f9ff]'
                : 'border-[#e5e7eb] bg-[#f9fafb]'
            "
            hover-class="none"
            @click.stop="$emit('reminder', { plant, type: 'water' })"
          >
            <image
              :src="waterReminderActive ? waterActiveIcon : waterDefaultIcon"
              class="!size-4 flex-[0_0_16px]"
              mode="aspectFit"
            />
          </button>
          <text class="text-[10px] leading-[14px] text-[#667085]">水</text>
        </view>
        <view class="flex flex-col items-center gap-0.5">
          <button
            :id="`plant-card-fertilization-${plant.id}`"
            class="m-0 box-border flex min-w-0 size-8 items-center justify-center rounded-full border p-0 after:border-0"
            :class="
              fertilizationReminderActive
                ? 'border-[#74d4ff] bg-[#f0f9ff]'
                : 'border-[#e5e7eb] bg-[#f9fafb]'
            "
            hover-class="none"
            @click.stop="$emit('fertilization', plant)"
          >
            <image
              :src="fertilizationReminderActive ? fertilizeActiveIcon : fertilizeDefaultIcon"
              class="!size-4 flex-[0_0_16px]"
              mode="aspectFit"
            />
          </button>
          <text class="text-[10px] leading-[14px] text-[#667085]">肥</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { parsePlantDateTime } from '@/utils/plant-datetime.js'
import PlantDisplayBase from '@/components/PlantDisplayBase.vue'
import PlantProfileCompleteness from './PlantProfileCompleteness.vue'
import diagnoseIcon from '@/assets/icons/home-card-diagnose.svg'
import historyIcon from '@/assets/icons/home-card-history.svg'
import fertilizeActiveIcon from '@/assets/icons/home-card-fertilize-active.svg'
import fertilizeDefaultIcon from '@/assets/icons/home-card-fertilize-default.svg'
import waterActiveIcon from '@/assets/icons/home-card-water-active.svg'
import waterDefaultIcon from '@/assets/icons/home-card-water-default.svg'

const props = defineProps({
  plant: { type: Object, required: true },
  reminderSummary: {
    type: Object,
    default: () => ({ water: { active: false } })
  }
})

defineEmits(['diagnose', 'history', 'edit', 'reminder', 'fertilization'])

const waterReminderActive = computed(() => Boolean(props.reminderSummary?.water?.active))
const needsWatering = computed(() => {
  const nextWater = props.plant?.nextWater || props.reminderSummary?.water?.nextWaterDate
  if (!nextWater) {
    return false
  }
  const dueAt = parsePlantDateTime(nextWater)
  return Boolean(dueAt && dueAt.getTime() <= Date.now())
})
const fertilizationReminderActive = computed(() =>
  Boolean(props.reminderSummary?.fertilize?.active || props.plant?.fertilizationReminder?.active)
)

const healthPresentation = computed(() => {
  const status = String(props.plant?.healthStatus || '')
    .trim()
    .toLowerCase()
  if (['healthy', 'good', 'normal'].includes(status)) {
    return {
      label: '状态良好',
      className: 'border-[#b9f8cf] bg-[#dcfce7] text-[#008236]'
    }
  }
  if (['warning', 'attention', 'unhealthy', 'poor', 'danger'].includes(status)) {
    return {
      label: '需要关注',
      className: 'border-[#f6d6a8] bg-[#fff3e0] text-[#b75a00]'
    }
  }
  return {
    label: '状态待评估',
    className: 'border-[#d9dde3] bg-[#f3f4f6] text-[#5b6472]'
  }
})
</script>
