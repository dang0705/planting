<template>
  <view class="mt-2">
    <view class="flex items-center gap-2">
      <view class="h-1.5 flex-1 overflow-hidden rounded-full bg-[#e5e7eb]">
        <view class="h-full rounded-full bg-[#2d7a4f]" :style="{ width: `${detail.score}%` }" />
      </view>
      <text class="text-[10px] font-semibold text-[#2d7a4f]">{{ detail.score }}%</text>
    </view>
    <text v-if="detail.requiredMissing" class="mt-1 block text-[10px] text-[#f97316]">
      待补养护城市
    </text>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { getPlantProfileCompletenessDetail } from '@/utils/plant-profile-completeness.js'

const props = defineProps({
  plant: { type: Object, required: true }
})

const detail = computed(() => getPlantProfileCompletenessDetail(props.plant))
</script>
