<template>
  <view
    class="h-[129px] w-full overflow-hidden rounded-[12px] border border-[rgba(45,122,79,0.15)] bg-white p-px shadow-[0_1px_3px_rgba(0,0,0,0.1),0_1px_2px_-1px_rgba(0,0,0,0.1)]"
  >
    <view class="flex h-[127px] w-full overflow-hidden rounded-[11px]">
      <view
        class="h-[127px] w-[112px] flex-[0_0_112px] overflow-hidden bg-[#f1f8f4]"
        @click.stop="$emit('detail', plant)"
      >
        <image v-if="plant.image" :src="plant.image" class="h-full w-full" mode="aspectFill" />
        <view v-else class="relative h-full w-full bg-[#f1f8f4]">
          <view
            class="absolute left-[54px] top-[34px] h-[58px] w-[3px] rounded-full bg-[#2d7a4f]"
          />
          <view
            class="absolute left-[29px] top-[38px] h-[18px] w-[28px] rotate-[-22deg] rounded-[999px_0_999px_0] bg-[#2d7a4f]"
          />
          <view
            class="absolute left-[57px] top-[51px] h-[18px] w-[28px] rotate-[22deg] scale-x-[-1] rounded-[999px_0_999px_0] bg-[#2d7a4f]"
          />
        </view>
      </view>

      <view class="flex h-[127px] min-w-0 flex-1 flex-col gap-2 p-3">
        <view class="flex h-[27px] items-center gap-1.5">
          <PlantProfileCompleteness :plant="plant" @click="$emit('detail', plant)" />
          <text
            class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[18px] font-medium leading-[27px] text-[#0a0a0a]"
          >
            {{ plant.displayName }}
          </text>
        </view>

        <view class="flex h-[22px] items-center gap-1.5">
          <view
            class="inline-flex h-[22px] items-center justify-center rounded-full border border-[#b9f8cf] bg-[#dcfce7] px-[9px] py-[3px] text-xs font-normal leading-4 text-[#008236]"
          >
            <text>健康</text>
          </view>
          <view
            class="inline-flex h-[22px] items-center justify-center rounded-full border border-[#b8e6fe] bg-[#dff2fe] px-[9px] py-[3px] text-xs font-normal leading-4 text-[#0069a8]"
          >
            <text>需浇水</text>
          </view>
        </view>

        <view class="flex h-[38px] items-center gap-2">
          <button
            :id="`diagnose-entry-button-${plant.id}`"
            class="m-0 flex h-9 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] border-0 bg-[#2d7a4f] px-3 py-2 text-sm font-medium leading-5 text-white after:border-0"
            hover-class="none"
            @click.stop="$emit('diagnose', plant)"
          >
            <image :src="diagnoseIcon" class="size-4 flex-[0_0_16px]" mode="aspectFit" />
            <text>诊断</text>
          </button>
          <button
            class="m-0 flex h-9 border border-solid border-primary flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] bg-white px-3 py-2 text-sm font-medium leading-5 text-[#0a0a0a] after:border-0"
            hover-class="none"
            @click="$emit('history', plant)"
          >
            <image :src="historyIcon" class="size-4 flex-[0_0_16px]" mode="aspectFit" />
            <text>历史</text>
          </button>
        </view>
      </view>

      <view
        class="flex h-[127px] w-[49px] flex-[0_0_49px] flex-col items-center justify-center gap-2 border-l border-[rgba(45,122,79,0.15)] py-3 pl-[9px] pr-2"
      >
        <button
          v-for="item in reminderItems"
          :key="item.type"
          class="m-0 flex size-8 items-center justify-center rounded-full border p-0 after:border-0"
          :class="item.active ? 'border-[#74d4ff] bg-[#f0f9ff]' : 'border-[#e5e7eb] bg-[#f9fafb]'"
          hover-class="none"
          @click.stop="$emit('reminder', { plant, type: item.type })"
        >
          <image :src="item.icon" class="size-4 flex-[0_0_16px]" mode="aspectFit" />
        </button>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
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
    default: () => ({ water: { active: false }, fertilize: { active: false } })
  }
})

defineEmits(['diagnose', 'history', 'detail', 'reminder'])

const reminderItems = computed(() => [
  {
    type: 'water',
    active: Boolean(props.reminderSummary?.water?.active),
    icon: props.reminderSummary?.water?.active ? waterActiveIcon : waterDefaultIcon
  },
  {
    type: 'fertilize',
    active: Boolean(props.reminderSummary?.fertilize?.active),
    icon: props.reminderSummary?.fertilize?.active ? fertilizeActiveIcon : fertilizeDefaultIcon
  }
])
</script>
