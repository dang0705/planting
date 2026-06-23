<template>
  <view id="add-plant-selection-step" class="px-4 pb-5">
    <view class="mb-4">
      <text class="block text-[24px] font-bold leading-8 text-[#1f2937]">添加植物</text>
      <text class="mt-1 block text-sm leading-5 text-[#6b7280]">拍照识别或从常见植物中选择</text>
    </view>

    <view class="mb-4 flex items-center gap-2">
      <view class="flex h-12 flex-1 items-center rounded-2xl border border-[#e5e7eb] bg-white px-4">
        <input
          id="add-plant-search-input"
          :value="searchKeyword"
          type="text"
          placeholder="搜索植物名称"
          placeholder-class="text-gray-300"
          class="min-w-0 flex-1 text-sm text-[#1f2937]"
          @input="$emit('update:searchKeyword', $event.detail.value)"
          @confirm="$emit('search-confirm')"
        />
        <text v-if="!searchKeyword" class="text-gray-400">🔍</text>
        <text v-else class="text-gray-400" @click="$emit('clear-search')">✕</text>
      </view>
      <button
        id="add-plant-ai-identify-button"
        class="m-0 h-12 rounded-2xl bg-[#2d7a4f] px-4 text-sm font-bold leading-[48px] text-white"
        @click="$emit('ai-identify')"
      >
        AI 识别
      </button>
    </view>

    <text
      v-if="searchKeyword && !initialPlantsLoading && plantCount === 0"
      class="mb-3 block text-center text-xs text-gray-400"
    >
      未找到匹配的植物
    </text>

    <view class="mb-4">
      <text class="mb-3 block text-base font-bold text-[#1f2937]">常见室内植物</text>
      <view v-if="initialPlantsLoading" class="flex justify-center py-8">
        <text class="text-sm text-gray-400">加载中...</text>
      </view>
      <scroll-view
        v-else
        class="w-full"
        scroll-x
        enhanced
        show-scrollbar="false"
        lower-threshold="120"
        @touchstart="$emit('list-touch-start')"
        @touchend="$emit('list-touch-end')"
        @touchcancel="$emit('list-touch-end')"
        @scrolltolower="$emit('scroll-lower')"
      >
        <view class="flex gap-2 pb-2">
          <view
            v-for="(group, gi) in plantGroups"
            :key="group.key || gi"
            :class="[
              'shrink-0 snap-start gap-2',
              group.length < 3 ? 'grid grid-cols-1' : 'grid grid-cols-2 grid-rows-2'
            ]"
          >
            <PlantCard
              v-for="plant in group.items"
              :id="`add-plant-card-${plant.id}`"
              :key="plant.id"
              :plant="plant"
              :selected="selectedPlant?.id === plant.id"
              @select="$emit('select-plant', plant)"
            />
          </view>
          <view class="flex w-16 shrink-0 items-center justify-center">
            <text v-if="plantsLoadingMore" class="text-xs text-gray-400">加载中...</text>
            <text v-else-if="hasMorePlants" class="text-xs text-gray-300">更多</text>
          </view>
        </view>
      </scroll-view>
    </view>

    <view
      id="add-plant-selection-summary"
      class="mb-4 rounded-2xl bg-white px-4 py-3 shadow-sm"
      :class="canProceed ? 'border border-[#b9f8cf]' : 'border border-transparent'"
    >
      <text class="block text-xs font-bold text-[#6b7280]">当前选择</text>
      <text class="mt-1 block text-base font-bold text-[#1f2937]">
        {{ selectedPlant?.canonicalName || recognizedName || '还未选择植物' }}
      </text>
      <text class="mt-1 block text-xs text-[#9ca3af]">
        {{ canProceed ? '可继续完善植物信息' : '请选择植物或使用 AI 识别' }}
      </text>
    </view>

    <button
      id="add-plant-next-button"
      class="m-0 h-[52px] w-full rounded-2xl p-0 text-base font-bold leading-[52px] text-white"
      :class="canProceed ? 'bg-[#2d7a4f]' : 'bg-[#d1d5db]'"
      :disabled="!canProceed"
      @click="$emit('next')"
    >
      <text class="block truncate px-4">
        {{ selectedPlant?.canonicalName ? `选好了 · ${selectedPlant.canonicalName}` : '选好了' }}
      </text>
    </button>
  </view>
</template>

<script setup>
import PlantCard from './PlantCard.vue'

defineProps({
  searchKeyword: { type: String, default: '' },
  plantGroups: { type: Array, default: () => [] },
  plantCount: { type: Number, default: 0 },
  initialPlantsLoading: { type: Boolean, default: false },
  plantsLoadingMore: { type: Boolean, default: false },
  hasMorePlants: { type: Boolean, default: false },
  selectedPlant: { type: Object, default: null },
  recognizedName: { type: String, default: '' },
  canProceed: { type: Boolean, default: false }
})

defineEmits([
  'update:searchKeyword',
  'search-confirm',
  'clear-search',
  'scroll-lower',
  'select-plant',
  'ai-identify',
  'next',
  'list-touch-start',
  'list-touch-end'
])
</script>
