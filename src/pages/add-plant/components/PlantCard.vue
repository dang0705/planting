<template>
  <view
    class="bg-white border-2 rounded-2xl overflow-hidden transition-all duration-300"
    :class="selected ? 'border-primary bg-[#D8F3DC]' : 'border-transparent'"
    @click="$emit('select')"
  >
    <image v-if="plant.imageUrl" :src="plant.imageUrl" class="w-full block aspect-square" mode="aspectFill" />
    <view v-else class="w-full aspect-square bg-gray-100 flex items-center justify-center">
      <text class="text-[28px]">🌱</text>
    </view>
    <view class="px-2 py-2">
      <text class="block text-gray-700 font-medium text-center mb-1.5">{{ plant.name }}</text>
      <view class="flex flex-wrap justify-center gap-1">
        <text class="text-xs px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-500">💧{{ plant.wateringType }}</text>
        <text
          class="text-xs px-1.5 py-0.5 rounded-full"
          :class="plant.sunningType === '全日光' ? 'bg-orange-100 text-orange-700' : 'bg-amber-50 text-orange-400'"
        >{{ plant.sunningType === '全日光' ? '☀️' : '🌤️' }}{{ plant.sunningType }}</text>
      </view>
    </view>
  </view>
</template>

<script setup>
defineProps({
  plant: { type: Object, required: true },
  selected: { type: Boolean, default: false }
})
defineEmits(['select'])
</script>
