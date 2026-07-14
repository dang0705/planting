<template>
  <view
    class="flex items-center gap-3 rounded-[12px] border p-3"
    :class="selected ? 'border-[#2d7a4f] bg-[#e8f3ea]' : 'border-[rgba(45,122,79,0.15)] bg-white'"
    @click="$emit('select', plant)"
  >
    <PlantDisplayBase :plant="plant" container-class="h-[56px] w-[56px] rounded-lg" />

    <view class="min-w-0 flex-1">
      <text
        class="block overflow-hidden text-ellipsis whitespace-nowrap text-[15px] font-medium text-[#0a0a0a]"
      >
        {{ plant.displayName || '未命名植物' }}
      </text>
      <text
        v-if="plant.canonicalName || plant.genus"
        class="mt-0.5 block text-[12px] text-[#9ca3af]"
      >
        {{ plant.canonicalName || plant.genus }}
      </text>
    </view>

    <text v-if="selected" class="text-[18px] text-[#2d7a4f]">✓</text>
  </view>
</template>

<script setup>
import PlantDisplayBase from '@/components/PlantDisplayBase.vue'

defineProps({
  plant: { type: Object, required: true },
  selected: { type: Boolean, default: false }
})

defineEmits(['select'])
</script>
