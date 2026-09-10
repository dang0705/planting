<template>
  <view id="add-plant-selection-step" class="px-4 pb-5 pt-6">
    <view class="mb-6 flex items-center gap-2">
      <button
        id="add-plant-ai-identify-button"
        class="m-0 flex h-11 w-[127px] shrink-0 items-center justify-center gap-1.5 rounded-full p-0 text-sm font-medium text-white after:border-0"
        hover-class="none"
        :style="primaryButtonStyle"
        @click="$emit('ai-identify')"
      >
        <image :src="aiIdentifyIcon" class="size-4" mode="aspectFit" />
        <text>AI 拍照识别</text>
      </button>

      <view
        class="flex h-[45px] min-w-0 flex-1 items-center rounded-full border border-[#2d7a4f] bg-white px-4"
      >
        <input
          id="add-plant-search-input"
          :value="searchKeyword"
          type="text"
          placeholder="搜索植物"
          placeholder-style="color: rgba(10, 10, 10, 0.5)"
          class="min-w-0 flex-1 text-sm text-[#1f2937]"
          @input="$emit('update:searchKeyword', $event.detail.value)"
          @confirm="$emit('search-confirm')"
        />
        <image
          v-if="!searchKeyword"
          :src="searchIcon"
          class="size-4 flex-[0_0_16px]"
          mode="aspectFit"
        />
        <text v-else class="text-gray-400" @click="$emit('clear-search')">✕</text>
      </view>
    </view>

    <text
      v-if="searchKeyword && !initialPlantsLoading && plantCount === 0"
      class="mb-3 block text-center text-xs text-gray-400"
    >
      未找到匹配的植物
    </text>

    <view>
      <text class="mb-3 block text-sm font-medium leading-5 text-[#364153]">常见室内植物</text>
      <view v-if="initialPlantsLoading" class="flex justify-center py-8">
        <text class="text-sm text-gray-400">加载中...</text>
      </view>
      <view v-else class="w-full">
        <view class="grid grid-cols-2 gap-3">
          <view
            v-for="plant in plants"
            :id="`add-plant-card-${plant.id}`"
            :key="plant.id"
            class="min-w-0"
            @tap.stop="handlePlantSelect(plant)"
          >
            <PlantCard :plant="plant" :selected="selectedPlant?.id === plant.id" />
          </view>
        </view>
        <view
          id="add-plant-load-more-sentinel"
          class="flex min-h-[28px] w-full items-center justify-center"
          aria-hidden="true"
        >
          <text v-if="plantsLoadingMore" class="text-xs text-gray-400">加载中...</text>
          <text v-else-if="hasMorePlants" class="text-xs text-gray-300">继续下滑加载更多</text>
        </view>
      </view>
    </view>

    <button
      id="add-plant-next-button"
      class="m-0 mt-5 h-14 w-full rounded-2xl border border-solid p-0 text-base font-medium leading-[56px] after:border-0"
      hover-class="none"
      :class="canProceed ? 'border-transparent text-white' : 'border-primary bg-white text-primary'"
      :disabled="!canProceed"
      :style="canProceed ? primaryButtonStyle : ''"
      @click="$emit('next')"
    >
      <text class="block truncate px-4">
        {{
          canProceed
            ? selectedPlant?.canonicalName
              ? `选好了 · ${selectedPlant.canonicalName}`
              : '选好了'
            : '请选择一个植物'
        }}
      </text>
    </button>
  </view>
</template>

<script setup>
import { getCurrentInstance, nextTick, onBeforeUnmount, onMounted, watch } from 'vue'
import aiIdentifyIcon from '@/assets/icons/ai-identify.svg'
import searchIcon from '@/assets/icons/search.svg'
import PlantCard from './PlantCard.vue'

const LOAD_MORE_INTERSECTION_THRESHOLD = 0
const LOAD_MORE_VIEWPORT_MARGIN_PX = 160

const props = defineProps({
  searchKeyword: { type: String, default: '' },
  plants: { type: Array, default: () => [] },
  plantCount: { type: Number, default: 0 },
  initialPlantsLoading: { type: Boolean, default: false },
  plantsLoadingMore: { type: Boolean, default: false },
  hasMorePlants: { type: Boolean, default: false },
  selectedPlant: { type: Object, default: null },
  recognizedName: { type: String, default: '' },
  canProceed: { type: Boolean, default: false }
})

const primaryButtonStyle =
  'background: linear-gradient(90deg, #00a63e 0%, #00bc7d 100%); box-shadow: 0 2px 4px rgba(0, 166, 62, 0.2), 0 4px 6px rgba(0, 166, 62, 0.2)'

const emit = defineEmits([
  'update:searchKeyword',
  'search-confirm',
  'clear-search',
  'load-more',
  'select-plant',
  'ai-identify',
  'next'
])

const componentInstance = getCurrentInstance()
let loadMoreObserver = null

function disconnectLoadMoreObserver() {
  loadMoreObserver?.disconnect()
  loadMoreObserver = null
}

function observeLoadMoreSentinel() {
  disconnectLoadMoreObserver()

  if (
    typeof uni === 'undefined' ||
    typeof uni.createIntersectionObserver !== 'function' ||
    !componentInstance?.proxy
  ) {
    return
  }

  loadMoreObserver = uni.createIntersectionObserver(componentInstance.proxy, {
    thresholds: [LOAD_MORE_INTERSECTION_THRESHOLD]
  })
  loadMoreObserver
    .relativeToViewport({ bottom: LOAD_MORE_VIEWPORT_MARGIN_PX })
    .observe('#add-plant-load-more-sentinel', result => {
      if (
        Number(result?.intersectionRatio || LOAD_MORE_INTERSECTION_THRESHOLD) >
        LOAD_MORE_INTERSECTION_THRESHOLD
      ) {
        emit('load-more')
      }
    })
}

function scheduleLoadMoreObservation() {
  nextTick(observeLoadMoreSentinel)
}

onMounted(scheduleLoadMoreObservation)
onBeforeUnmount(disconnectLoadMoreObserver)
watch(() => [props.initialPlantsLoading, props.plants.length], scheduleLoadMoreObservation, {
  flush: 'post'
})

function handlePlantSelect(plant) {
  emit('select-plant', plant)
}
</script>
