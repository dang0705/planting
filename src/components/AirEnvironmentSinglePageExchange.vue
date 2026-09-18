<template>
  <view :id="`${idPrefix}-single-exchange`">
    <text class="block text-sm font-semibold leading-5 text-[#0a0a0a]"> 房间平时怎么换气？ </text>
    <text class="mt-1 block text-xs leading-5 text-[#5a7a68]">
      先判断室内空气通常从哪里得到更新
    </text>

    <AirEnvironmentSinglePageSplitChoice
      :id="`${idPrefix}-single-exchange-layout`"
      :scene-id="`${idPrefix}-single-exchange-window`"
      :label="exchangeLabel"
      :description="exchangeDescription"
      :scene="windowScene"
      :disabled="disabled"
    >
      <view :id="`${idPrefix}-single-window-details`" class="flex min-w-0 flex-1 flex-col gap-2">
        <view class="min-w-0 rounded-xl border border-[rgba(45,122,79,0.15)] bg-white p-2">
          <text class="block text-[10px] font-medium leading-4 text-[#5a7a68]">几个方向有窗</text>
          <view class="mt-1 flex flex-wrap gap-1">
            <view
              v-for="direction in windowDirectionOptions"
              :id="`${idPrefix}-single-window-direction-${direction.key}`"
              :key="direction.key"
              class="flex min-w-[48%] flex-[1_1_48%] items-center justify-center gap-1 rounded-lg border px-1 py-1"
              :class="
                windowDirectionDisabled
                  ? effectiveWindowDirectionCount === direction.key
                    ? 'border-[rgba(169,184,174,0.45)] bg-[#eef3ef] text-[#8da899]'
                    : 'border-[rgba(169,184,174,0.45)] text-[#a9b8ae]'
                  : effectiveWindowDirectionCount === direction.key
                    ? 'border-brand bg-[#e8f5e9] text-[#2d7a4f]'
                    : 'border-[rgba(45,122,79,0.12)] text-[#5a7a68]'
              "
              :aria-label="compactDirectionLabel(direction.key)"
              :aria-disabled="windowDirectionDisabled"
              @click="selectWindowDirection(direction.key)"
            >
              <text class="min-w-0 break-words whitespace-normal text-center text-[10px] leading-4">
                {{ compactDirectionLabel(direction.key) }}
              </text>
            </view>
          </view>
        </view>

        <view class="min-w-0 rounded-xl border border-[rgba(45,122,79,0.15)] bg-white p-2">
          <text class="block text-[10px] font-medium leading-4 text-[#5a7a68]">开窗频率</text>
          <picker
            :id="`${idPrefix}-single-window-frequency-picker`"
            mode="selector"
            :range="windowFrequencyPickerOptions"
            :value="frequencyPickerIndex"
            :disabled="windowControlsDisabled"
            @change="selectWindowFrequencyFromPicker"
          >
            <view
              class="mt-1 flex min-w-0 items-center justify-between rounded-lg border border-[rgba(45,122,79,0.12)] bg-[#f8faf9] px-1 py-1"
              :class="windowControlsDisabled ? 'opacity-60' : ''"
            >
              <text
                class="min-w-0 break-words text-[10px] leading-4"
                :class="windowControlsDisabled ? 'text-[#8da899]' : 'text-[#2d7a4f]'"
              >
                {{ selectedWindowFrequencyLabel }}
              </text>
              <text class="ml-1 shrink-0 text-[10px] leading-4 text-[#74907e]">⌄</text>
            </view>
          </picker>
        </view>

        <view
          v-if="input.windowOpenFrequency === 'almost_never' || input.source === 'fresh_air'"
          :id="`${idPrefix}-single-fresh-air-switch-row`"
          class="flex items-center justify-between rounded-xl border border-[rgba(45,122,79,0.15)] bg-white px-1 py-1"
        >
          <text class="min-w-0 truncate text-[9px] font-medium leading-4 text-[#0a0a0a]">
            开启新风
          </text>
          <view class="ml-1 flex h-6 w-11 shrink-0 items-center justify-end overflow-hidden">
            <switch
              :id="`${idPrefix}-single-fresh-air-switch`"
              :checked="input.source === 'fresh_air'"
              color="#2d7a4f"
              :disabled="disabled"
              class="origin-right scale-75"
              @change="toggleFreshAir"
            />
          </view>
        </view>
      </view>
    </AirEnvironmentSinglePageSplitChoice>
  </view>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import AirEnvironmentSinglePageSplitChoice from '@/components/AirEnvironmentSinglePageSplitChoice.vue'
import {
  WINDOW_DIRECTION_COUNT_OPTIONS,
  WINDOW_OPEN_FREQUENCY_OPTIONS,
  createInitialAirExchangeInput
} from '@/utils/air-exchange-evidence.js'

const props = defineProps({
  modelValue: { type: Object, default: () => createInitialAirExchangeInput() },
  idPrefix: { type: String, default: 'air-environment' },
  disabled: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue', 'change'])

const windowDirectionOptions = WINDOW_DIRECTION_COUNT_OPTIONS
const windowFrequencyOptions = WINDOW_OPEN_FREQUENCY_OPTIONS
const windowFrequencyPickerOptions = Object.freeze(
  windowFrequencyOptions.map(option => (option.key === 'weekly_1_2' ? '每周1–2次' : option.label))
)
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
const frequencyPickerIndex = computed(() => {
  const index = windowFrequencyOptions.findIndex(
    option => option.key === effectiveWindowOpenFrequency.value
  )
  return index >= 0 ? index : 0
})
const effectiveWindowDirectionCount = computed(() =>
  input.value.source === 'window'
    ? input.value.windowDirectionCount
    : lastWindowSelection.value.windowDirectionCount
)
const effectiveWindowOpenFrequency = computed(() =>
  input.value.source === 'window'
    ? input.value.windowOpenFrequency
    : lastWindowSelection.value.windowOpenFrequency
)
const windowControlsDisabled = computed(() => props.disabled || input.value.source === 'fresh_air')
const windowDirectionDisabled = computed(
  () => windowControlsDisabled.value || input.value.windowOpenFrequency === 'almost_never'
)
const selectedWindowFrequencyLabel = computed(
  () => windowFrequencyPickerOptions[frequencyPickerIndex.value] || windowFrequencyPickerOptions[0]
)
const windowScene = computed(() => {
  if (input.value.source === 'fresh_air') {
    return 'fresh-air'
  }
  if (input.value.windowOpenFrequency === 'almost_never') {
    return 'window-closed'
  }
  if (input.value.windowDirectionCount === 'two_or_more') {
    return 'window-two'
  }
  return 'window-one'
})
const exchangeLabel = computed(() => {
  if (input.value.source === 'fresh_air') {
    return '主要靠新风'
  }
  if (input.value.windowOpenFrequency === 'almost_never') {
    return '平时几乎不开窗'
  }
  return '主要靠开窗'
})
const exchangeDescription = computed(() => {
  if (input.value.source === 'fresh_air') {
    return '门窗关闭时，由新风设备进行空气交换'
  }
  if (input.value.windowOpenFrequency === 'almost_never') {
    return '平时很少开窗，房间空气更新较少'
  }
  return '窗户带来空气流动'
})

function commit(value) {
  if (value.source === 'window') {
    lastWindowSelection.value = {
      windowDirectionCount: value.windowDirectionCount,
      windowOpenFrequency: value.windowOpenFrequency
    }
  }
  input.value = value
  emit('update:modelValue', value)
  emit('change', value)
}

function selectWindowDirection(key) {
  if (windowDirectionDisabled.value) {
    return
  }
  const baseInput =
    input.value.source === 'window'
      ? input.value
      : { source: 'window', ...lastWindowSelection.value }
  commit({
    ...baseInput,
    windowDirectionCount: key
  })
}

function compactDirectionLabel(key) {
  return key === 'two_or_more' ? '2个+' : '1个'
}

function selectWindowFrequency(key) {
  if (windowControlsDisabled.value) {
    return
  }
  const baseInput =
    input.value.source === 'window'
      ? input.value
      : { source: 'window', ...lastWindowSelection.value }
  commit({ ...baseInput, windowOpenFrequency: key })
}

function selectWindowFrequencyFromPicker(event) {
  const index = Number(event?.detail?.value)
  const option = windowFrequencyOptions[index]
  if (option) {
    selectWindowFrequency(option.key)
  }
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
