<template>
  <scroll-view scroll-y class="h-screen px-4 pt-6">
    <text class="mb-4 block text-[20px] font-bold leading-7 text-[#1f2937]">
      选择浇水建议方式
    </text>

    <!-- 已有植物入口 -->
    <view
      id="watering-advisor-go-my-plants"
      class="mb-3 rounded-2xl border border-[#e1e9dd] bg-white p-4"
      @click="$emit('go-my-plants')"
    >
      <view class="flex items-center gap-3">
        <view class="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e8f3ea]">
          <text class="text-[20px]">🌱</text>
        </view>
        <view class="flex-1">
          <text class="block text-[15px] font-bold text-[#1f2933]">从我的植物选</text>
          <text class="block text-[12px] text-[#6b7280]"
            >选择已添加的植物，基于浇水历史给出建议</text
          >
        </view>
        <text class="text-[18px] text-[#9ca3af]">›</text>
      </view>
    </view>

    <!-- 植物种类入口 -->
    <view
      class="rounded-2xl border-2 p-4"
      :class="selectedPlant ? 'border-[#2d7a4f] bg-[#e8f3ea]' : 'border-[#e1e9dd] bg-white'"
    >
      <view class="mb-3 flex items-center gap-3">
        <view class="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f0f4ed]">
          <text class="text-[20px]">🔍</text>
        </view>
        <view class="flex-1">
          <text class="block text-[15px] font-bold text-[#1f2933]">搜索植物种类</text>
          <text class="block text-[12px] text-[#6b7280]">不需要添加植物，直接选种类获取建议</text>
        </view>
      </view>

      <!-- 搜索框 -->
      <view
        class="mb-3 flex items-center gap-2 rounded-xl border border-[#e1e9dd] bg-[#f7faf5] px-3 py-2"
      >
        <text class="text-[14px] text-[#9ca3af]">🔎</text>
        <input
          id="watering-advisor-search-input"
          v-model="searchKeyword"
          class="flex-1 text-[14px] text-[#1f2933]"
          placeholder="搜索植物名称"
          confirm-type="search"
          @confirm="handleSearchConfirm"
          @input="handleSearchInput"
        />
        <text
          v-if="searchKeyword"
          id="watering-advisor-search-clear"
          class="text-[14px] text-[#9ca3af]"
          @click="clearSearch"
          >✕</text
        >
      </view>

      <!-- 搜索结果列表 -->
      <scroll-view
        v-if="plants.length"
        scroll-y
        class="max-h-[300px] rounded-xl border border-[#e1e9dd] bg-white"
      >
        <view
          v-for="plant in plants"
          :key="plant.plantIdentityId || plant.sessionPlantId"
          :id="`watering-advisor-plant-item-${plant.plantIdentityId || plant.sessionPlantId || ''}`"
          class="flex items-center gap-3 border-b border-[#f0f4ed] px-3 py-2.5"
          :class="isSelected(plant) ? 'bg-[#e8f3ea]' : 'bg-white'"
          @click="selectPlant(plant)"
        >
          <image
            v-if="plant.imageUrl"
            :src="plant.imageUrl"
            class="h-10 w-10 rounded-lg object-cover"
            mode="aspectFill"
          />
          <view v-else class="flex h-10 w-10 items-center justify-center rounded-lg bg-[#f0f4ed]">
            <text class="text-[16px]">🌿</text>
          </view>
          <view class="flex-1">
            <text class="block text-[14px] font-medium text-[#1f2933]">
              {{ plant.primaryDisplayName || plant.canonicalName || '未知植物' }}
            </text>
            <text v-if="plant.plantGenus" class="block text-[11px] text-[#9ca3af]">
              {{ plant.plantGenus }}
            </text>
          </view>
          <text v-if="isSelected(plant)" class="text-[16px] text-[#2d7a4f]">✓</text>
        </view>
        <view
          v-if="hasMore"
          id="watering-advisor-load-more"
          class="px-3 py-2.5 text-center"
          @click="$emit('load-more')"
        >
          <text class="text-[12px] text-[#2d7a4f]">
            {{ loadingMore ? '加载中...' : '加载更多' }}
          </text>
        </view>
      </scroll-view>

      <view v-if="!plants.length && !initialLoading" class="py-6 text-center">
        <text class="text-[12px] text-[#9ca3af]">输入植物名称开始搜索</text>
      </view>
      <view v-if="initialLoading" class="py-6 text-center">
        <text class="text-[12px] text-[#9ca3af]">搜索中...</text>
      </view>
    </view>

    <view v-if="selectedPlant" class="mt-4">
      <button
        id="watering-advisor-next-button"
        class="m-0 h-[52px] w-full rounded-2xl bg-[#2d7a4f] p-0 text-base font-bold leading-[52px] text-white"
        @click="$emit('next')"
      >
        下一步：输入盆型
      </button>
    </view>
  </scroll-view>
</template>

<script setup>
import { ref } from 'vue'
import { useDefaultPlants } from '@/composables/useDefaultPlants.js'

const props = defineProps({
  selectedPlant: { type: Object, default: null }
})

const emit = defineEmits(['go-my-plants', 'next', 'load-more', 'select'])

const SEARCH_DEBOUNCE_MS = 500
const searchKeyword = ref('')
let searchTimer = null

const { plants, initialLoading, loadingMore, hasMore, load, loadNextPage } = useDefaultPlants()

defineExpose({
  loadPlants: keyword => load(keyword),
  loadNextPage
})

function isSelected(plant) {
  const selectedId = props.selectedPlant?.plantIdentityId || props.selectedPlant?.sessionPlantId
  const plantId = plant.plantIdentityId || plant.sessionPlantId
  return Boolean(selectedId) && selectedId === plantId
}

function selectPlant(plant) {
  emit('select', plant)
}

function handleSearchInput() {
  if (searchTimer) {
    clearTimeout(searchTimer)
  }
  searchTimer = setTimeout(() => {
    load(searchKeyword.value.trim())
  }, SEARCH_DEBOUNCE_MS)
}

function handleSearchConfirm() {
  if (searchTimer) {
    clearTimeout(searchTimer)
  }
  load(searchKeyword.value.trim())
}

function clearSearch() {
  searchKeyword.value = ''
  load('')
}
</script>
