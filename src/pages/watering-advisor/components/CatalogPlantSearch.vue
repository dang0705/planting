<template>
  <view class="relative h-full">
    <scroll-view
      scroll-y
      class="box-border w-full px-4 pb-[112px] pt-6"
      style="height: calc(100vh - 132px)"
    >
      <text class="mb-4 block text-[20px] font-bold leading-7 text-[#1f2937]">选择植物</text>

      <!-- 已有植物入口 -->
      <uni-collapse
        id="watering-advisor-my-plants-collapse"
        v-model="myPlantsCollapseName"
        accordion
        :border="false"
        class="mb-3 overflow-hidden rounded-2xl border border-[#e1e9dd] bg-white"
        @change="handleMyPlantsCollapseChange"
      >
        <uni-collapse-item name="my-plants" :border="false" :title-border="false">
          <template #title>
            <view id="watering-advisor-my-plants-entry" class="flex items-center gap-3 p-4">
              <view class="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e8f3ea]">
                <text class="text-[20px]">🌱</text>
              </view>
              <view class="min-w-0 flex-1">
                <text class="block text-[15px] font-bold text-[#1f2933]">从我的植物选</text>
                <text class="block text-[12px] leading-5 text-[#6b7280]">
                  选择已添加的植物，基于浇水历史给出建议
                </text>
              </view>
            </view>
          </template>

          <view class="px-4 pb-4">
            <view v-if="myPlantsLoading" class="py-8 text-center">
              <text class="text-[14px] text-[#9ca3af]">加载中...</text>
            </view>
            <view v-else-if="!myPlants.length" class="py-8 text-center">
              <text class="text-[14px] text-[#9ca3af]">还没有添加植物</text>
            </view>
            <view v-else id="watering-advisor-my-plants-list" class="flex flex-col gap-3">
              <PlantSelectCard
                v-for="plant in myPlants"
                :key="plant.id"
                :id="`watering-advisor-my-plant-card-${plant.id}`"
                :plant="plant"
                :selected="selectedUserPlantId === plant.id"
                @select="plantItem => $emit('select-user-plant', plantItem)"
              />
            </view>

            <view class="mt-4">
              <button
                id="watering-advisor-my-plants-back"
                class="m-0 h-[48px] w-full rounded-2xl border border-[#2d7a4f] bg-white p-0 text-sm font-bold leading-[48px] text-[#2d7a4f]"
                @click.stop="$emit('toggle-my-plants', false)"
              >
                收起列表
              </button>
            </view>
          </view>
        </uni-collapse-item>
      </uni-collapse>

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
        <view v-if="plants.length" class="rounded-xl border border-[#e1e9dd] bg-white">
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
        </view>

        <view v-if="!plants.length && !initialLoading" class="py-6 text-center">
          <text class="text-[12px] text-[#9ca3af]">输入植物名称开始搜索</text>
        </view>
        <view v-if="initialLoading" class="py-6 text-center">
          <text class="text-[12px] text-[#9ca3af]">搜索中...</text>
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useDefaultPlants } from '@/composables/useDefaultPlants.js'
import PlantSelectCard from './PlantSelectCard.vue'

const props = defineProps({
  selectedPlant: { type: Object, default: null },
  myPlantsExpanded: { type: Boolean, default: false },
  myPlantsLoading: { type: Boolean, default: false },
  myPlants: { type: Array, default: () => [] },
  selectedUserPlantId: { type: [String, Number], default: null }
})

const emit = defineEmits(['toggle-my-plants', 'load-more', 'select', 'select-user-plant', 'next'])

const SEARCH_DEBOUNCE_MS = 500
const MY_PLANTS_PANEL_NAME = 'my-plants'
const searchKeyword = ref('')
const myPlantsCollapseName = ref('')
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

function handleMyPlantsCollapseChange(value) {
  const nextValue = Array.isArray(value) ? value[0] : value
  emit('toggle-my-plants', nextValue === MY_PLANTS_PANEL_NAME)
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

watch(
  () => props.myPlantsExpanded,
  expanded => {
    myPlantsCollapseName.value = expanded ? MY_PLANTS_PANEL_NAME : ''
  },
  { immediate: true }
)
</script>
