<template>
  <view
    :id="`${idPrefix}-assessment`"
    class="flex flex-col gap-3"
    :class="{ 'pointer-events-none opacity-60': disabled }"
  >
    <SelectableCard
      :id="`${idPrefix}-source-window`"
      :selected="true"
      :disabled="disabled"
      class="overflow-hidden p-0"
      @select="selectWindowSource"
    >
      <view class="flex w-full items-center justify-center py-2">
        <view class="aspect-[2/1] w-3/4 shrink-0 overflow-hidden rounded-xl">
          <AirflowScene
            :scene="windowScene"
            thumbnail
            :thumbnail-aspect-ratio="2"
            class="h-full w-full"
          />
        </view>
      </view>
      <view class="box-border min-h-[72px] w-full p-2">
        <text class="block text-sm font-medium leading-5 text-[#0a0a0a]">{{ exchangeLabel }}</text>
        <text class="mt-[2px] block text-xs leading-[16.5px] text-[#5a7a68]">
          {{ exchangeDescription }}
        </text>
      </view>
    </SelectableCard>

    <view
      v-if="input.source === 'window'"
      :id="`${idPrefix}-window-details`"
      class="rounded-2xl border border-[rgba(45,122,79,0.15)] bg-white p-[13px]"
    >
      <text class="block text-xs text-[#5a7a68]">植物所处房间/客厅在几个方向上有窗</text>
      <view class="mt-2 flex gap-2">
        <view
          v-for="direction in windowDirectionOptions"
          :key="direction.key"
          :id="`${idPrefix}-window-direction-${direction.key.replace(/_/g, '-')}`"
          class="flex-1 rounded-xl border py-[7px] text-center text-sm font-medium"
          :class="
            input.windowDirectionCount === direction.key
              ? windowDirectionDisabled
                ? 'border-[#b8c9be] bg-[#f1f5f2] text-[#8da899]'
                : 'border-brand bg-brand text-white'
              : windowDirectionDisabled
                ? 'border-[rgba(184,201,190,0.65)] bg-[#f8faf9] text-[#a9b8ae]'
                : 'border-[rgba(45,122,79,0.15)] bg-white text-[#5a7a68]'
          "
          :aria-disabled="windowDirectionDisabled"
          @click="selectWindowDirection(direction.key)"
        >
          {{ direction.label }}
        </view>
      </view>

      <text class="mt-3 block text-xs text-[#5a7a68]">开窗频率</text>
      <view class="mt-2 flex flex-wrap gap-2">
        <view
          v-for="frequency in windowFrequencyOptions"
          :key="frequency.key"
          :id="`${idPrefix}-window-frequency-${frequency.key.replace(/_/g, '-')}`"
          class="flex-1 rounded-xl border py-[7px] text-center text-sm font-medium"
          :class="
            input.windowOpenFrequency === frequency.key
              ? 'border-brand bg-brand text-white'
              : 'border-[rgba(45,122,79,0.15)] bg-white text-[#5a7a68]'
          "
          @click="selectWindowFrequency(frequency.key)"
        >
          {{ frequency.label }}
        </view>
      </view>

      <view
        v-if="input.windowOpenFrequency === 'almost_never'"
        :id="`${idPrefix}-fresh-air-switch-row`"
        class="mt-3 flex items-center justify-between rounded-xl bg-[#f8faf9] px-3 py-2"
      >
        <view class="min-w-0 pr-3">
          <text class="block text-sm font-medium leading-5 text-[#0a0a0a]">开启新风</text>
          <text class="mt-[2px] block text-xs leading-5 text-[#5a7a68]">
            门窗关闭时，使用新风设备换气
          </text>
        </view>
        <switch
          :id="`${idPrefix}-fresh-air-switch`"
          :checked="false"
          color="#2d7a4f"
          :disabled="disabled"
          @change="toggleFreshAir"
        />
      </view>
    </view>

    <view
      v-else-if="input.source === 'fresh_air'"
      :id="`${idPrefix}-fresh-air-switch-row`"
      class="rounded-2xl border border-[rgba(45,122,79,0.15)] bg-white p-[13px]"
    >
      <view class="flex items-center justify-between">
        <view class="min-w-0 pr-3">
          <text class="block text-sm font-medium leading-5 text-[#0a0a0a]">开启新风</text>
          <text class="mt-[2px] block text-xs leading-5 text-[#5a7a68]">
            门窗关闭时，使用新风设备换气
          </text>
        </view>
        <switch
          :id="`${idPrefix}-fresh-air-switch`"
          :checked="true"
          color="#2d7a4f"
          :disabled="disabled"
          @change="toggleFreshAir"
        />
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import AirflowScene from '@/components/AirflowScene.vue'
import SelectableCard from '@/components/SelectableCard.vue'
import {
  WINDOW_DIRECTION_COUNT_OPTIONS,
  WINDOW_OPEN_FREQUENCY_OPTIONS,
  createInitialAirExchangeInput
} from '@/utils/air-exchange-evidence.js'

const props = defineProps({
  modelValue: { type: Object, default: () => createInitialAirExchangeInput() },
  idPrefix: { type: String, default: 'airflow' },
  disabled: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue', 'change'])

const windowDirectionOptions = WINDOW_DIRECTION_COUNT_OPTIONS
const windowFrequencyOptions = WINDOW_OPEN_FREQUENCY_OPTIONS
const DEFAULT_WINDOW_DIRECTION_COUNT = 'one'
const DEFAULT_WINDOW_OPEN_FREQUENCY = 'daily'
const input = ref({ ...createInitialAirExchangeInput(), ...props.modelValue })
const lastWindowSelection = ref({
  windowDirectionCount: ['one', 'two_or_more'].includes(input.value.windowDirectionCount)
    ? input.value.windowDirectionCount
    : DEFAULT_WINDOW_DIRECTION_COUNT,
  windowOpenFrequency: windowFrequencyOptions.some(
    option => option.key === input.value.windowOpenFrequency
  )
    ? input.value.windowOpenFrequency
    : DEFAULT_WINDOW_OPEN_FREQUENCY
})
const windowScene = computed(() => {
  if (input.value.source === 'fresh_air') {
    return 'fresh-air'
  }
  if (input.value.windowOpenFrequency === 'almost_never') {
    return 'window-closed'
  }
  return input.value.windowDirectionCount === 'two_or_more' ? 'window-two' : 'window-one'
})
const windowDirectionDisabled = computed(
  () =>
    props.disabled ||
    input.value.source !== 'window' ||
    input.value.windowOpenFrequency === 'almost_never'
)
const exchangeLabel = computed(() => {
  if (input.value.source === 'fresh_air') {
    return '主要靠新风'
  }
  return input.value.windowOpenFrequency === 'almost_never' ? '平时几乎不开窗' : '主要靠开窗'
})
const exchangeDescription = computed(() => {
  if (input.value.source === 'fresh_air') {
    return '门窗关闭时，由新风设备进行空气交换'
  }
  return input.value.windowOpenFrequency === 'almost_never'
    ? '平时很少开窗，房间空气更新较少'
    : '窗户带来空气流动'
})

function commit(nextValue) {
  if (nextValue.source === 'window') {
    lastWindowSelection.value = {
      windowDirectionCount: nextValue.windowDirectionCount,
      windowOpenFrequency: nextValue.windowOpenFrequency
    }
  }
  input.value = nextValue
  emit('update:modelValue', nextValue)
  emit('change', nextValue)
}

function selectWindowSource() {
  if (props.disabled || input.value.source === 'window') {
    return
  }
  commit({ source: 'window', ...lastWindowSelection.value })
}

function selectWindowDirection(key) {
  if (windowDirectionDisabled.value) {
    return
  }
  commit({ ...input.value, windowDirectionCount: key })
}

function selectWindowFrequency(key) {
  if (props.disabled || input.value.source !== 'window') {
    return
  }
  commit({ ...input.value, windowOpenFrequency: key })
}

function toggleFreshAir(event) {
  if (props.disabled) {
    return
  }
  const enabled = event?.detail?.value === true
  if (enabled) {
    commit({ source: 'fresh_air', windowDirectionCount: null, windowOpenFrequency: null })
    return
  }
  commit({ source: 'window', ...lastWindowSelection.value })
}

watch(
  () => props.modelValue,
  value => {
    input.value = { ...createInitialAirExchangeInput(), ...value }
    if (input.value.source === 'window') {
      lastWindowSelection.value = {
        windowDirectionCount: ['one', 'two_or_more'].includes(input.value.windowDirectionCount)
          ? input.value.windowDirectionCount
          : DEFAULT_WINDOW_DIRECTION_COUNT,
        windowOpenFrequency: windowFrequencyOptions.some(
          option => option.key === input.value.windowOpenFrequency
        )
          ? input.value.windowOpenFrequency
          : DEFAULT_WINDOW_OPEN_FREQUENCY
      }
    }
  },
  { deep: true }
)
</script>
