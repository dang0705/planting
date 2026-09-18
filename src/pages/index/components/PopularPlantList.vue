<template>
  <view
    v-if="visible"
    id="index-popular-plants-list"
    class="overflow-hidden rounded-2xl bg-white shadow-[0_8px_24px_rgba(20,70,40,0.16)]"
  >
    <view
      v-for="plant in plants"
      :id="`index-popular-plant-${plant.id || plant.plantId || getPlantDisplayName(plant)}`"
      :key="plant.id || plant.plantId || getPlantDisplayName(plant)"
      class="flex h-[72px] items-center gap-3 border-b border-[#edf3ef] px-4 last:border-b-0 active:bg-[#f5faf6]"
      @click="emit('select', plant)"
    >
      <PlantDisplayBase :plant="plant" container-class="size-12 shrink-0 rounded-full" />
      <view class="min-w-0 flex-1">
        <text class="block truncate text-base font-medium leading-5 text-[#101828]">
          {{ getPlantDisplayName(plant) || '植物' }}
        </text>
        <text
          v-if="getPlantAliasText(plant)"
          class="mt-1 block truncate text-xs leading-4 text-[#6b7f73]"
        >
          {{ getPlantAliasText(plant) }}
        </text>
      </view>
      <text class="shrink-0 text-2xl font-light leading-none text-[#9aafa1]">›</text>
    </view>

    <view v-if="loading && !plants.length" id="index-popular-plants-loading" class="px-4 py-6">
      <text class="block text-center text-sm text-[#6b7f73]">正在加载植物</text>
    </view>
    <view v-else-if="!plants.length" id="index-popular-plants-empty" class="px-4 py-6">
      <text class="block text-center text-sm text-[#6b7f73]">没有找到相关植物</text>
    </view>
  </view>
</template>

<script setup>
import PlantDisplayBase from '@/components/PlantDisplayBase.vue'
import {
  getPlantAliasText,
  getPlantDisplayName
} from '@/pages/index/components/popular-indoor-plants.js'

defineProps({
  visible: { type: Boolean, default: false },
  plants: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false }
})

const emit = defineEmits(['select'])
</script>
