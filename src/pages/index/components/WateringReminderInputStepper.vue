<template>
  <view :id="`${idPrefix}-stepper`" class="pt-1">
    <view class="mb-3 flex items-center justify-center gap-2">
      <template v-for="(step, index) in steps" :key="step.key">
        <view class="flex items-center gap-1.5">
          <view
            :id="`${idPrefix}-step-${step.key}`"
            class="flex size-6 items-center justify-center rounded-full text-[11px] font-bold"
            :class="
              index <= safeActiveStep ? 'bg-[#2d7a4f] text-white' : 'bg-[#e1e9dd] text-[#718075]'
            "
          >
            {{ index + 1 }}
          </view>
          <text
            class="text-[12px]"
            :class="index === safeActiveStep ? 'font-semibold text-[#1f2933]' : 'text-[#9ca3af]'"
          >
            {{ step.label }}
          </text>
        </view>
        <view v-if="index < steps.length - 1" class="h-[1px] w-8 bg-[#e1e9dd]" />
      </template>
    </view>

    <ButtonStepTrack
      :id="`${idPrefix}-swiper`"
      :items="steps"
      :active-index="safeActiveStep"
      :fill="false"
      viewport-class="w-full"
      item-class="relative min-h-0 overflow-hidden"
      active-item-class="h-auto"
    >
      <template #step="{ index, active }">
        <view v-if="active && index === HISTORY_STEP" class="pb-2">
          <CareBehaviorTimeline
            :id-prefix="`${idPrefix}-history`"
            :sticky="true"
            :timeline="timeline"
            :loading="loading"
            :error="''"
            :enable-dose-per-date="true"
            :pot-volume-ml="potVolumeMl"
            @change="handleTimelineChange"
          />
        </view>
        <view v-else-if="active && index === POT_STEP" class="pb-2">
          <PotProfileFormCore
            ref="potFormRef"
            :initial-profile="initialProfile"
            :id-prefix="`${idPrefix}-pot-profile`"
            @change="handlePotProfileChange"
          />
        </view>
      </template>
    </ButtonStepTrack>
  </view>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import ButtonStepTrack from '@/components/common/ButtonStepTrack.vue'
import CareBehaviorTimeline from '@/components/CareBehaviorTimeline.vue'
import PotProfileFormCore from '@/components/pot-profile/PotProfileFormCore.vue'
import { resolveComponentMethod } from '@/utils/component-ref.js'
import { buildWateringReminderInputSignature } from './watering-reminder-options.js'

const HISTORY_STEP = 0
const POT_STEP = 1

const props = defineProps({
  activeStep: { type: Number, default: HISTORY_STEP },
  timeline: { type: Object, default: () => ({}) },
  loading: { type: Boolean, default: false },
  error: { type: [String, Object], default: '' },
  potVolumeMl: { type: Number, default: 0 },
  initialProfile: { type: Object, default: null },
  idPrefix: { type: String, default: 'watering-reminder-input' }
})

const emit = defineEmits(['update:active-step', 'history-change'])
const steps = [
  { key: 'history', label: '过往浇水日期' },
  { key: 'pot', label: '盆型设置' }
]
const potFormRef = ref(null)
const potProfileDraft = ref(null)
const selectedWateringEvents = ref([])
const lastHistorySignature = ref('')

const safeActiveStep = computed(() =>
  Math.min(Math.max(Number(props.activeStep) || HISTORY_STEP, HISTORY_STEP), POT_STEP)
)

watch(
  safeActiveStep,
  step => {
    if (step !== POT_STEP) {
      return
    }
    nextTick(() => invokePotFormMethod('initCanvas'))
  },
  { flush: 'post', immediate: true }
)

function resolveWateringEvents(timeline = {}) {
  return Array.isArray(timeline?.watering_events_10d) ? timeline.watering_events_10d : []
}

watch(
  () => props.timeline,
  timeline => {
    const events = resolveWateringEvents(timeline)
    selectedWateringEvents.value = events
    lastHistorySignature.value = buildWateringReminderInputSignature({ wateringEvents: events })
  },
  { deep: true, immediate: true }
)

function handleTimelineChange(payload) {
  const events = resolveWateringEvents(payload)
  const nextSignature = buildWateringReminderInputSignature({ wateringEvents: events })
  selectedWateringEvents.value = events
  // CareBehaviorTimeline 初始化时会立即发出一次 payload。只要业务值没有变化，
  // 不再把它写回父层，否则父层的 timeline 深度监听会和这里形成反馈环。
  if (nextSignature === lastHistorySignature.value) {
    return
  }
  lastHistorySignature.value = nextSignature
  emit('history-change', { ...payload, watering_events_10d: events })
}

function setActiveStep(step) {
  emit(
    'update:active-step',
    Math.min(Math.max(Number(step) || HISTORY_STEP, HISTORY_STEP), POT_STEP)
  )
}

function hasWateringHistory() {
  return selectedWateringEvents.value.length > 0
}

function next() {
  if (safeActiveStep.value === HISTORY_STEP) {
    if (!hasWateringHistory()) {
      return false
    }
    setActiveStep(POT_STEP)
    return true
  }
  return true
}

function previous() {
  if (safeActiveStep.value === POT_STEP) {
    setActiveStep(HISTORY_STEP)
    return true
  }
  return false
}

function getWateringEvents() {
  return selectedWateringEvents.value
}

function getPotFormTargets() {
  const value = potFormRef.value
  return Array.isArray(value) ? value : value ? [value] : []
}

function invokePotFormMethod(methodName, ...args) {
  for (const target of getPotFormTargets()) {
    const method = resolveComponentMethod(target, methodName)
    if (method) {
      return method(...args)
    }
  }
  return undefined
}

function handlePotProfileChange(payload) {
  potProfileDraft.value = payload || null
}

function getPotProfilePayload() {
  return potProfileDraft.value || invokePotFormMethod('getPayload') || null
}

function getPotProfileState() {
  const payload = potProfileDraft.value
  if (payload) {
    const hasTop = Number(payload.potTopDiameterCm) > 0
    const hasBottom = Number(payload.potBottomDiameterCm) > 0
    const hasHeight = Number(payload.potHeightCm) > 0
    if (!hasTop && !hasBottom && !hasHeight) {
      return 'empty'
    }
    return hasTop && hasBottom && hasHeight ? 'complete' : 'basic'
  }
  return invokePotFormMethod('getProfileState')
}

function validatePotProfile() {
  return invokePotFormMethod('validate') ?? true
}

function confirmOversizedPot() {
  return invokePotFormMethod('confirmOversizedPot') ?? true
}

function commitPotProfile() {
  return invokePotFormMethod('commitProfileData') || getPotProfilePayload()
}

defineExpose({
  getPotProfilePayload,
  getPotProfileState,
  getWateringEvents,
  hasWateringHistory,
  next,
  previous,
  validatePotProfile,
  confirmOversizedPot,
  commitPotProfile
})
</script>
