<template>
  <view
    class="h-[234px] w-[142px] shrink-0 overflow-hidden rounded-2xl border bg-white transition-all duration-200"
    :style="cardStyle"
    @click="$emit('select')"
  >
    <view class="h-[117px] w-full" style="background-color: rgba(45, 122, 79, 0.05)">
      <image v-if="plant.image" :src="plant.image" class="block h-full w-full" mode="aspectFill" />
      <view v-else class="flex h-full w-full items-center justify-center">
        <text class="text-[28px]">🌱</text>
      </view>
    </view>
    <view class="flex h-[116px] flex-col gap-[6px] px-[10px] py-[10px]">
      <text class="block truncate text-sm font-medium leading-5 text-[#101828]">
        {{ plant.canonicalName }}
      </text>
      <view class="flex flex-col gap-[3px]">
        <text class="text-xs font-medium leading-4 text-[#4a5565]">💧 浇水 {{ waterLevel }}</text>
        <text class="text-xs font-medium leading-4 text-[#4a5565]">☀️ 光照 {{ lightLevel }}</text>
        <text class="text-xs font-medium leading-4 text-[#4a5565]">
          🍃 通风 {{ ventilationLevel }}
        </text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  plant: { type: Object, required: true },
  selected: { type: Boolean, default: false }
})
defineEmits(['select'])

const cardStyle = computed(() =>
  props.selected
    ? 'border-color: #2d7a4f; box-shadow: 0 0 0 2px rgba(45, 122, 79, 0.3)'
    : 'border-color: rgba(45, 122, 79, 0.15)'
)
const waterLevel = computed(() => resolveCareLevel(props.plant.watering, '中'))
const lightLevel = computed(() => resolveCareLevel(props.plant.sunning, '低'))
const ventilationLevel = computed(() => resolveCareLevel(props.plant.ventilation, '中'))

function resolveCareLevel(strategy, fallback) {
  const explicit = [
    strategy?.level,
    strategy?.demand,
    strategy?.intensity,
    strategy?.frequencyLevel,
    strategy?.degree
  ]
    .map(value => String(value || '').trim())
    .find(Boolean)

  if (explicit) {
    return normalizeLevel(explicit, fallback)
  }

  return normalizeLevel(
    [strategy?.way, strategy?.frequency, strategy?.description, strategy?.note].join(' '),
    fallback
  )
}

function normalizeLevel(text, fallback) {
  const value = String(text || '')
  if (/高|强|多|频繁|全日|充足|湿润|每天/.test(value)) {
    return '高'
  }
  if (/低|弱|少|耐旱|半干|干透|微干|低光|散射/.test(value)) {
    return '低'
  }
  if (/中|适中|普通|一般|半阴/.test(value)) {
    return '中'
  }
  return fallback
}
</script>
