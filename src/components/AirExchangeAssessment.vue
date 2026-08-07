<template>
  <view
    :id="`${idPrefix}-assessment`"
    class="flex flex-col gap-3"
    :class="{ 'pointer-events-none opacity-60': disabled }"
  >
    <!-- 换气来源场景卡：纵向答卷布局；关闭窗户作为方向选项 -->
    <view class="flex flex-col gap-3">
      <!-- 来源选项共用同一张卡片外壳；新增来源只需传入内容与图例 -->
      <SelectableCard
        :id="`${idPrefix}-source-window`"
        :selected="input.source === 'window'"
        :disabled="disabled"
        @select="selectSource('window')"
      >
        <view class="overflow-hidden rounded-2xl bg-[rgba(241,248,244,0.5)]">
          <AirflowScene
            :scene="
              input.windowDirectionCount === 'two_or_more'
                ? 'window-two'
                : input.windowDirectionCount === 'closed'
                  ? 'window-closed'
                  : 'window-one'
            "
          />
        </view>
        <text class="mt-3 block text-sm font-medium leading-5 text-[#0a0a0a]">窗户情况</text>
        <text class="mt-1 block text-xs font-medium leading-4 text-[#5a7a68]">
          有窗时选择开窗方向，也可以选择关闭窗户
        </text>
      </SelectableCard>

      <SelectableCard
        :id="`${idPrefix}-source-fresh_air`"
        :selected="input.source === 'fresh_air'"
        :disabled="disabled"
        @select="selectSource('fresh_air')"
      >
        <view class="overflow-hidden rounded-2xl bg-[rgba(241,248,244,0.5)]">
          <AirflowScene scene="fresh-air" />
        </view>
        <text class="mt-3 block text-sm font-medium leading-5 text-[#0a0a0a]">新风系统换气</text>
        <text class="mt-1 block text-xs font-medium leading-4 text-[#5a7a68]">
          门窗通常关闭，主要依靠新风设备进行空气交换
        </text>
      </SelectableCard>

      <SelectableCard
        :id="`${idPrefix}-source-unknown`"
        :selected="input.source === 'unknown'"
        :disabled="disabled"
        class="flex items-center gap-3"
        @select="selectSource('unknown')"
      >
        <view
          class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[rgba(241,248,244,0.5)]"
        >
          <text class="text-2xl text-[#74907e]">?</text>
        </view>
        <view class="flex-1">
          <text class="block text-sm font-medium leading-5 text-[#0a0a0a]">不确定</text>
          <text class="mt-1 block text-xs font-medium leading-4 text-[#5a7a68]">
            不清楚目前的换气情况
          </text>
        </view>
      </SelectableCard>
    </view>

    <!-- 窗户补充项：仅 source === 'window' 时展开，对齐 Figma 450:1509 横向按钮组 -->
    <view
      v-if="input.source === 'window'"
      class="rounded-2xl border border-[rgba(45,122,79,0.15)] bg-white p-[13px]"
    >
      <!-- 窗户情况 -->
      <text class="block text-xs text-[#5a7a68]">几个方向有窗</text>
      <view class="mt-2 flex gap-2">
        <view
          v-for="direction in windowDirectionOptions"
          :key="direction.key"
          :id="`${idPrefix}-window-direction-${direction.key.replace(/_/g, '-')}`"
          class="flex-1 rounded-xl border py-[7px] text-center text-sm font-medium"
          :class="
            input.windowDirectionCount === direction.key
              ? 'border-brand bg-brand text-white'
              : 'border-[rgba(45,122,79,0.15)] bg-white text-[#5a7a68]'
          "
          @click="selectWindowDirection(direction.key)"
        >
          {{ direction.label }}
        </view>
      </view>

      <!-- 开窗频率：关闭窗户时不展示，也不要求回答 -->
      <template v-if="input.windowDirectionCount !== 'closed'">
        <text class="mt-3 block text-xs text-[#5a7a68]">开窗频率</text>
        <view class="mt-2 flex gap-2">
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
      </template>
    </view>
  </view>
</template>

<script setup>
import { ref, watch } from 'vue'
import {
  WINDOW_DIRECTION_COUNT_OPTIONS,
  WINDOW_OPEN_FREQUENCY_OPTIONS,
  createInitialAirExchangeInput
} from '@/utils/air-exchange-evidence.js'
import AirflowScene from '@/components/AirflowScene.vue'
import SelectableCard from '@/components/SelectableCard.vue'

const props = defineProps({
  modelValue: { type: Object, default: () => createInitialAirExchangeInput() },
  idPrefix: { type: String, default: 'airflow' },
  disabled: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue', 'change'])

// 组件只采集原始闭集值，不做 sanitize / 归一化 / 校验；非法值由纯函数判定。
// 仅对 modelValue 做不改变字段值的浅拷贝，避免直接改 props。
function shallowCopy(value) {
  return { ...value }
}

const input = ref(shallowCopy(props.modelValue))

// 开窗方向选项（文案对齐 Figma 450:1509）
const windowDirectionOptions = WINDOW_DIRECTION_COUNT_OPTIONS
// 开窗频率选项（文案对齐 Figma 450:1509）
const windowFrequencyOptions = WINDOW_OPEN_FREQUENCY_OPTIONS

function commit(nextValue) {
  input.value = nextValue
  emit('update:modelValue', nextValue)
  emit('change', nextValue)
}

// 切换来源：切换到非 window 时两个开窗字段必须清为 null
function selectSource(key) {
  if (props.disabled) {
    return
  }
  if (key === 'window') {
    commit({
      source: 'window',
      windowDirectionCount: ['one', 'two_or_more'].includes(input.value.windowDirectionCount)
        ? input.value.windowDirectionCount
        : null,
      windowOpenFrequency: ['daily', 'every_other_day', 'weekly_1_2'].includes(
        input.value.windowOpenFrequency
      )
        ? input.value.windowOpenFrequency
        : null
    })
    return
  }
  commit({ source: key, windowDirectionCount: null, windowOpenFrequency: null })
}

function selectWindowDirection(key) {
  if (props.disabled || input.value.source !== 'window') {
    return
  }
  commit({
    source: 'window',
    windowDirectionCount: key,
    windowOpenFrequency: key === 'closed' ? null : input.value.windowOpenFrequency
  })
}

function selectWindowFrequency(key) {
  if (props.disabled || input.value.source !== 'window') {
    return
  }
  commit({ ...input.value, windowOpenFrequency: key })
}

watch(
  () => props.modelValue,
  value => {
    input.value = shallowCopy(value)
  },
  { deep: true }
)
</script>
