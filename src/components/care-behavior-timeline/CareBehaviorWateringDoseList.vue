<template>
  <view
    v-if="rows.length"
    class="care-dose-list mt-3 rounded-[12px] border border-gray-100 bg-white p-3"
  >
    <text class="block text-sm font-medium text-gray-900">每次浇了多少水？</text>
    <!-- 图例：替代原"以 550ml 矿泉水瓶为参照"文案 -->
    <view class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
      <view v-if="hasBottle" class="flex items-center gap-1">
        <image :src="bottleIcon" class="h-5 w-5" mode="aspectFit" />
        <text class="text-[10px] text-gray-400">= 550ml 矿泉水瓶</text>
      </view>
      <view v-if="hasBucket" class="flex items-center gap-1">
        <image :src="bucketIcon" class="h-5 w-5" mode="aspectFit" />
        <text class="text-[10px] text-gray-400">= 5L 水桶</text>
      </view>
    </view>
    <view v-for="row in rows" :key="row.date" class="mt-3">
      <view class="flex items-center justify-between">
        <text class="text-xs font-medium text-gray-700">{{ row.date }}</text>
        <text class="text-sm font-bold text-[#2f8f57]">{{ doseLabel(row.amountMl) }}</text>
      </view>
      <view class="mt-2">
        <slider
          :id="`watering-dose-slider-${row.date}`"
          class="dose-slider w-full min-w-0 m-0"
          :min="0"
          :max="sliderMaxIndex"
          :step="1"
          :value="doseOptionIndex(row.amountMl)"
          activeColor="#2f8f57"
          backgroundColor="#e5e7eb"
          block-color="#ffffff"
          block-size="18"
          @change="onDoseSliderChange(row.date, $event)"
        />
        <view class="relative mt-1 h-10 w-full">
          <view
            v-for="(opt, index) in bottleOptions"
            :id="`watering-dose-label-${row.date}-${index}`"
            :key="opt.value || index"
            class="absolute top-0 flex flex-col items-center text-[10px] text-gray-400"
            :style="getLabelStyle(index)"
            @tap="onDoseLabelTap(row.date, index)"
          >
            <!-- "不知道"档：纯文字，无图标 -->
            <template v-if="!opt.icon">{{ opt.amount }}</template>
            <!-- 有图标档位：N × icon -->
            <template v-else>
              <view class="flex items-center gap-0.5">
                <text>{{ opt.count }}×</text>
                <image
                  :src="opt.icon === 'bottle' ? bottleIcon : bucketIcon"
                  class="h-5 w-3"
                  :class="{ 'opacity-50': opt.count === 0.5 }"
                  mode="aspectFit"
                />
              </view>
            </template>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import {
  resolveWateringDoseOptions,
  resolveBottleOptionValue
} from '@/utils/water-volume-format.js'
import bottleIcon from '@/assets/icons/water-bottle.svg'
import bucketIcon from '@/assets/icons/oil-bucket.svg'

const props = defineProps({
  rows: { type: Array, default: () => [] },
  potVolumeMl: { type: Number, default: 0 }
})
const emit = defineEmits(['update-dose'])

const bottleOptions = computed(() => resolveWateringDoseOptions(props.potVolumeMl))
const sliderMaxIndex = computed(() => Math.max(0, bottleOptions.value.length - 1))

/** 图例：当前选项中是否出现了瓶 / 桶图标 */
const hasBottle = computed(() => bottleOptions.value.some(o => o.icon === 'bottle'))
const hasBucket = computed(() => bottleOptions.value.some(o => o.icon === 'bucket'))

function doseLabel(amountMl) {
  const value = resolveBottleOptionValue(amountMl, bottleOptions.value)
  const opt = bottleOptions.value.find(o => o.value === value)
  return opt?.label || '不知道'
}

function doseOptionIndex(amountMl) {
  const optionValue = resolveBottleOptionValue(amountMl, bottleOptions.value)
  const index = bottleOptions.value.findIndex(option => option.value === optionValue)
  return index >= 0 ? index : 0
}

// slider block-size=18，轨道两端各有 9px 内边距，标签需对此补偿对齐
const SLIDER_BLOCK_HALF = 9

function dosageLabelPosition(index) {
  const max = sliderMaxIndex.value
  if (!Number.isFinite(max) || max <= 0) {
    return `${SLIDER_BLOCK_HALF}px`
  }
  // 将 0~max 线性映射到 [9px, calc(100% - 9px)] 区间
  const ratio = index / max
  return `calc(${SLIDER_BLOCK_HALF}px + ${ratio} * (100% - ${SLIDER_BLOCK_HALF * 2}px))`
}

/**
 * 档位标签定位样式。
 * 第一个标签：left 对齐，不偏移
 * 最后一个标签：left + translateX(-100%) 右对齐
 * 中间标签：left + translateX(-50%) 居中
 */
function getLabelStyle(index) {
  const max = sliderMaxIndex.value
  if (index === 0) {
    return { left: dosageLabelPosition(0), 'align-items': 'flex-start' }
  }
  if (index === max) {
    return {
      left: dosageLabelPosition(max),
      transform: 'translateX(-100%)',
      'align-items': 'flex-end'
    }
  }
  return {
    left: dosageLabelPosition(index),
    transform: 'translateX(-50%)',
    'align-items': 'center'
  }
}

function onDoseSliderChange(date, event) {
  const raw = event?.detail?.value ?? event
  const index = Number(raw)
  const safeIndex =
    Number.isFinite(index) && index >= 0 && index <= sliderMaxIndex.value ? Math.round(index) : 0
  const option = bottleOptions.value[safeIndex] || bottleOptions.value[0]
  selectDose(date, option?.amountMl ?? null)
}

/** 点击档位标签，将 slider 切到对应档位 */
function onDoseLabelTap(date, index) {
  const option = bottleOptions.value[index]
  if (!option) {
    return
  }
  selectDose(date, option.amountMl ?? null)
}

function selectDose(date, amountMl) {
  emit('update-dose', { date, amountMl })
}
</script>
