<template>
  <view :id="`${idPrefix}-dual-mode`" class="w-full">
    <view
      :id="`${idPrefix}-tabs`"
      class="mb-5 flex rounded-2xl border border-[#dbe8df] bg-[#f2f7f3] p-1"
      role="tablist"
    >
      <button
        :id="`${idPrefix}-tab-quick`"
        class="m-0 h-10 flex-1 rounded-xl border-0 p-0 text-sm leading-10"
        :class="
          activeMode === 'quick'
            ? 'bg-white font-bold text-[#2d7a4f] shadow-sm'
            : 'bg-transparent font-medium text-[#5a7a68]'
        "
        role="tab"
        :disabled="disabled"
        :aria-selected="activeMode === 'quick'"
        @click="setMode('quick')"
      >
        快速填写
      </button>
      <button
        :id="`${idPrefix}-tab-advanced`"
        class="m-0 h-10 flex-1 rounded-xl border-0 p-0 text-sm leading-10"
        :class="
          activeMode === 'advanced'
            ? 'bg-white font-bold text-[#2d7a4f] shadow-sm'
            : 'bg-transparent font-medium text-[#5a7a68]'
        "
        role="tab"
        :disabled="disabled"
        :aria-selected="activeMode === 'advanced'"
        @click="setMode('advanced')"
      >
        精细设置
      </button>
    </view>

    <view v-if="activeMode === 'quick'" :id="`${idPrefix}-quick-question`">
      <text class="block text-[18px] font-bold leading-7 text-[#1f2937]">
        这盆植物所处的空间，平时换气频率更接近哪一种？
      </text>
      <text class="mt-1 block text-[13px] leading-5 text-[#6b7280]">
        按长期通常情况选择，不需要只回忆最近几天。
      </text>
      <view class="mt-4 flex flex-col gap-3">
        <button
          v-for="option in QUICK_AIR_ENVIRONMENT_OPTIONS"
          :id="`${idPrefix}-quick-option-${option.key}`"
          :key="option.key"
          class="m-0 min-h-[76px] w-full rounded-2xl border px-4 py-3 text-left"
          :class="
            quickOptionKey === option.key
              ? 'border-[#2d7a4f] bg-[#eef8f1]'
              : 'border-[#dfe8e2] bg-white'
          "
          :aria-checked="quickOptionKey === option.key"
          role="radio"
          :disabled="disabled"
          @click="selectQuickOption(option.key)"
        >
          <text
            class="block text-sm font-bold"
            :class="quickOptionKey === option.key ? 'text-[#2d7a4f]' : 'text-[#1f2937]'"
          >
            {{ option.label }}
          </text>
          <text class="mt-1 block text-xs leading-5 text-[#5a7a68]">
            {{ option.description }}
          </text>
        </button>
      </view>
    </view>

    <AirEnvironmentAssessment
      v-else
      :id-prefix="`${idPrefix}-advanced`"
      layout-mode="single-page"
      height-mode="content"
      :model-value="advancedDraft"
      :disabled="disabled"
      :external-footer="true"
      @change="setAdvancedDraft"
    />

    <view
      v-if="!externalFooter"
      class="flex gap-3"
      :class="
        footerPosition === 'fixed'
          ? 'fixed bottom-0 left-0 right-0 z-[100] box-border border-t border-[#e1e9dd] bg-[#f8faf9] px-4 pb-5 pt-3'
          : 'mt-6'
      "
    >
      <button
        v-if="backLabel"
        :id="backId || `${idPrefix}-back`"
        class="m-0 h-[52px] flex-1 rounded-2xl border border-[#2d7a4f] bg-white p-0 text-base font-bold leading-[52px] text-[#2d7a4f]"
        :disabled="disabled"
        @click="emit('back')"
      >
        {{ backLabel }}
      </button>
      <button
        :id="completionId || `${idPrefix}-next`"
        class="m-0 h-[52px] flex-[2] rounded-2xl bg-[#2d7a4f] p-0 text-base font-bold leading-[52px] text-white"
        :class="{ 'opacity-50': disabled }"
        :disabled="disabled"
        @click="completeActiveMode"
      >
        {{ completionLabel }}
      </button>
    </view>
  </view>
</template>

<script setup>
import { ref, watch } from 'vue'
import AirEnvironmentAssessment from './AirEnvironmentAssessment.vue'
import {
  QUICK_AIR_ENVIRONMENT_OPTIONS,
  buildAdvancedAirEnvironmentAssessment,
  buildQuickAirEnvironmentAssessment,
  getCompletedQuickAirEnvironmentAnswer,
  getInitialAdvancedAirEnvironmentInput,
  getPreferredAirEnvironmentMode
} from '@/utils/air-environment-assessment.js'

const props = defineProps({
  idPrefix: { type: String, default: 'air-environment' },
  profile: { type: Object, default: null },
  draftState: { type: Object, default: null },
  initialMode: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  backLabel: { type: String, default: '上一步' },
  backId: { type: String, default: '' },
  completionLabel: { type: String, default: '下一步' },
  completionId: { type: String, default: '' },
  footerPosition: { type: String, default: 'inline' },
  externalFooter: { type: Boolean, default: false }
})

const emit = defineEmits(['back', 'complete', 'draft-change'])
const activeMode = ref(
  props.draftState?.mode === 'advanced' || props.draftState?.mode === 'quick'
    ? props.draftState.mode
    : props.initialMode === 'advanced' || props.initialMode === 'quick'
      ? props.initialMode
      : getPreferredAirEnvironmentMode(props.profile)
)
const quickOptionKey = ref(
  props.draftState?.quickAnswer?.optionKey ||
    getCompletedQuickAirEnvironmentAnswer(props.profile)?.optionKey ||
    ''
)
const advancedDraft = ref(
  props.draftState?.advancedInput || getInitialAdvancedAirEnvironmentInput(props.profile)
)

watch(
  () => props.profile,
  profile => {
    quickOptionKey.value = getCompletedQuickAirEnvironmentAnswer(profile)?.optionKey || ''
    advancedDraft.value = getInitialAdvancedAirEnvironmentInput(profile)
    if (!props.initialMode) {
      activeMode.value = getPreferredAirEnvironmentMode(profile)
    }
  }
)

watch(
  () => props.draftState,
  draftState => {
    if (!draftState) {
      return
    }
    if (draftState.mode === 'quick' || draftState.mode === 'advanced') {
      activeMode.value = draftState.mode
    }
    quickOptionKey.value = draftState.quickAnswer?.optionKey || ''
    advancedDraft.value = cloneDraft(
      draftState.advancedInput || getInitialAdvancedAirEnvironmentInput(props.profile)
    )
  },
  { deep: true }
)

function cloneDraft(value) {
  return JSON.parse(JSON.stringify(value))
}

function emitDraftChange(editKind = 'answer') {
  emit('draft-change', {
    editKind,
    mode: activeMode.value,
    quickAnswer: quickOptionKey.value
      ? { questionKey: 'air_exchange_frequency', optionKey: quickOptionKey.value }
      : null,
    advancedInput: JSON.parse(JSON.stringify(advancedDraft.value))
  })
}

function setMode(mode) {
  if (mode === 'quick' || mode === 'advanced') {
    activeMode.value = mode
    emitDraftChange('mode_switch')
  }
}

function selectQuickOption(optionKey) {
  quickOptionKey.value = optionKey
  emitDraftChange('answer')
}

function setAdvancedDraft(value) {
  advancedDraft.value = value
  emitDraftChange('answer')
}

function completeActiveMode() {
  const result =
    activeMode.value === 'quick'
      ? buildQuickAirEnvironmentAssessment({ selectedOptionKey: quickOptionKey.value })
      : buildAdvancedAirEnvironmentAssessment(advancedDraft.value)
  if (!result.ok) {
    uni.showToast({ title: result.userMessage, icon: 'none' })
    return
  }
  emit('complete', result.value)
}

defineExpose({ completeActiveMode })
</script>
