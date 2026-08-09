<template>
  <view
    :id="`${idPrefix}-assessment`"
    class="flex flex-col gap-4"
    :class="{ 'pointer-events-none opacity-60': disabled }"
  >
    <view class="flex flex-col" :class="isContentHeight ? '' : 'min-h-0'" :style="panelStyle">
      <AirEnvironmentSinglePagePrototype
        v-if="isSinglePage"
        :id-prefix="idPrefix"
        :model-value="environment"
        :disabled="disabled"
        :back-label="backLabel"
        :back-id="resolvedBackId"
        :completion-label="completionLabel"
        :completion-id="resolvedCompletionId"
        @change="commit"
        @back="goBack"
        @complete="value => emit('complete', value)"
      />
      <ButtonStepTrack
        v-else
        :id="`${idPrefix}-swiper`"
        :fill="!isContentHeight"
        :root-class="isContentHeight ? '' : 'h-full'"
        :class="isContentHeight ? '' : 'h-full'"
        :active-index="activeStep"
        :step-count="STEP_COUNT"
        :footer-position="footerPosition"
        :viewport-class="isContentHeight ? 'w-full' : 'w-full h-full'"
        :item-class="isContentHeight ? 'relative' : 'relative min-h-0 overflow-hidden'"
        :active-item-class="isContentHeight ? '' : 'h-full'"
      >
        <template #step="{ index, active }">
          <scroll-view
            v-if="active && index === AIR_EXCHANGE_STEP"
            :id="`${idPrefix}-exchange-step`"
            :scroll-y="!isContentHeight"
            class="box-border pb-[112px]"
            :class="isContentHeight ? '' : 'h-full'"
            :style="stepPanelStyle"
          >
            <text class="block text-base font-semibold leading-6 text-[#0a0a0a]">
              室内外空气交换
            </text>
            <text class="mt-1 block text-xs leading-5 text-[#5a7a68]">
              先判断植物所在房间平时怎样与室外换气
            </text>
            <AirExchangeAssessment
              class="mt-3"
              :id-prefix="`${idPrefix}-exchange`"
              :model-value="environment.airExchange"
              :disabled="disabled"
              @change="handleAirExchangeChange"
            />
          </scroll-view>

          <scroll-view
            v-else-if="active && index === LOCAL_AIRFLOW_STEP"
            :id="`${idPrefix}-local-airflow-step`"
            :scroll-y="!isContentHeight"
            class="box-border pb-[112px]"
            :class="isContentHeight ? '' : 'h-full'"
            :style="stepPanelStyle"
          >
            <view class="mt-4 rounded-xl border border-[rgba(45,122,79,0.15)] bg-white p-5">
              <text class="block text-base font-semibold leading-6 text-[#0a0a0a]">
                植物周围的室内气流
              </text>
              <text class="mt-1 block text-xs leading-5 text-[#5a7a68]">
                再判断植物附近的空间和设备风；上一项的新风选择只决定这里是否显示新风来源
              </text>

              <view class="mt-5">
                <text class="block text-sm font-semibold leading-6 text-[#0a0a0a]">
                  植物周围是否开阔
                </text>
                <text class="mt-1 block text-xs leading-5 text-[#5a7a68]">
                  只看植物附近是否被墙、柜子或其他植物围住
                </text>
              </view>
              <view class="mt-3 grid grid-cols-2 gap-2">
                <AirEnvironmentOptionCard
                  v-for="option in canopyOptions"
                  :id="`${idPrefix}-canopy-${option.key}`"
                  :key="option.key"
                  :label="option.label"
                  :description="option.description"
                  :scene="option.scene"
                  :motion-profile="option.motionProfile"
                  :is-unknown="option.key === 'unknown'"
                  :selected="environment.canopyOpenness === option.key"
                  :show-selection-indicator="false"
                  orientation="vertical"
                  :description-lines="['enclosed', 'unknown'].includes(option.key) ? 2 : 1"
                  :disabled="disabled"
                  @select="selectCanopy(option.key)"
                />
              </view>

              <view class="mt-6">
                <DeviceAirflowAssessment
                  :id-prefix="idPrefix"
                  :model-value="environment.deviceAirflow"
                  :air-exchange="environment.airExchange"
                  :disabled="disabled"
                  @change="handleDeviceAirflowChange"
                />
              </view>

              <view
                v-if="environmentReady"
                :id="`${idPrefix}-insight`"
                class="mt-6 rounded-2xl bg-[#e8f5e9] px-4 py-3"
              >
                <text
                  v-for="message in insightMessages"
                  :key="message"
                  class="block text-xs leading-5 text-[#1b5e20]"
                  :class="{ 'mt-1': message !== insightMessages[0] }"
                >
                  {{ message }}
                </text>
              </view>
            </view>
          </scroll-view>
        </template>
        <template #footer>
          <view
            :id="`${idPrefix}-step-navigation`"
            class="flex items-center gap-3 border-t border-[rgba(45,122,79,0.15)] bg-[#f8faf9] px-4 pb-5 pt-3"
          >
            <button
              v-if="activeStep === AIR_EXCHANGE_STEP && backLabel"
              :id="resolvedBackId"
              class="m-0 h-[52px] flex-1 rounded-2xl border border-[#2d7a4f] bg-white p-0 text-base font-bold leading-[52px] text-[#2d7a4f]"
              :disabled="disabled"
              @click="goBack"
            >
              {{ backLabel }}
            </button>
            <button
              v-if="activeStep === AIR_EXCHANGE_STEP"
              :id="`${idPrefix}-next-step`"
              class="m-0 h-[52px] rounded-2xl bg-[#2d7a4f] p-0 text-base font-bold leading-[52px] text-white"
              :class="backLabel ? 'flex-[2]' : 'w-full'"
              :disabled="disabled || !exchangeReady"
              @click="nextStep"
            >
              下一步：室内气流
            </button>
            <button
              v-if="activeStep === LOCAL_AIRFLOW_STEP"
              :id="`${idPrefix}-previous-step`"
              class="m-0 h-[52px] flex-1 rounded-2xl border border-[#2d7a4f] bg-white p-0 text-base font-bold leading-[52px] text-[#2d7a4f]"
              :disabled="disabled"
              @click="previousStep"
            >
              上一步
            </button>
            <button
              v-if="activeStep === LOCAL_AIRFLOW_STEP && completionLabel"
              :id="resolvedCompletionId"
              class="m-0 h-[52px] flex-[2] rounded-2xl bg-[#2d7a4f] p-0 text-base font-bold leading-[52px] text-white"
              :class="{ 'opacity-50': disabled || !environmentReady }"
              :disabled="disabled || !environmentReady"
              @click="complete"
            >
              {{ completionLabel }}
            </button>
            <text
              v-else-if="activeStep === LOCAL_AIRFLOW_STEP"
              :id="`${idPrefix}-step-complete-hint`"
              class="flex-[2] text-center text-xs leading-5 text-[#5a7a68]"
            >
              填写完成后继续当前页面操作
            </text>
          </view>
        </template>
      </ButtonStepTrack>
    </view>
  </view>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import ButtonStepTrack from '@/components/common/ButtonStepTrack.vue'
import AirExchangeAssessment from '@/components/AirExchangeAssessment.vue'
import AirEnvironmentOptionCard from '@/components/AirEnvironmentOptionCard.vue'
import AirEnvironmentSinglePagePrototype from '@/components/AirEnvironmentSinglePagePrototype.vue'
import DeviceAirflowAssessment from '@/components/DeviceAirflowAssessment.vue'
import {
  createInitialAirEnvironmentInput,
  getAirEnvironmentSignature,
  isAirEnvironmentAnswerReady,
  sanitizeAirEnvironmentInput
} from '@/utils/air-environment.js'
import { isAirExchangeAnswerReady } from '@/utils/air-exchange-evidence.js'

const props = defineProps({
  modelValue: { type: Object, default: () => createInitialAirEnvironmentInput() },
  idPrefix: { type: String, default: 'air-environment' },
  layoutMode: { type: String, default: 'single-page' },
  panelHeight: { type: Number, default: 560 },
  heightMode: { type: String, default: 'content' },
  disabled: { type: Boolean, default: false },
  footerPosition: { type: String, default: 'absolute' },
  backLabel: { type: String, default: '' },
  backId: { type: String, default: '' },
  completionLabel: { type: String, default: '' },
  completionId: { type: String, default: '' }
})
const emit = defineEmits(['update:modelValue', 'change', 'step-change', 'back', 'complete'])

const AIR_EXCHANGE_STEP = 0
const LOCAL_AIRFLOW_STEP = 1
const STEP_COUNT = 2
const DEFAULT_WINDOW_DIRECTION_COUNT = 'one'
const DEFAULT_WINDOW_OPEN_FREQUENCY = 'daily'
const DEFAULT_FRESH_AIR_SOURCE_COUNT = 1
const FIRST_SOURCE_INDEX = 0
const activeStep = ref(AIR_EXCHANGE_STEP)
const isSinglePage = computed(() => props.layoutMode === 'single-page')
const isContentHeight = computed(() => props.heightMode === 'content')
const panelStyle = computed(() =>
  isContentHeight.value ? undefined : { height: `${props.panelHeight}px` }
)
const stepPanelStyle = computed(() => panelStyle.value)

const canopyOptions = Object.freeze([
  {
    key: 'open',
    label: '比较开阔',
    description: '周围留有空间',
    scene: 'window-one',
    motionProfile: 'canopy-open'
  },
  {
    key: 'partial',
    label: '有些遮挡',
    description: '一侧靠墙或家具',
    scene: 'window-one',
    motionProfile: 'canopy-partial'
  },
  {
    key: 'enclosed',
    label: '周围遮挡较多',
    description: '墙角、柜边，或周围摆放了很多植物',
    scene: 'closed',
    motionProfile: 'canopy-enclosed'
  },
  {
    key: 'unknown',
    label: '不确定',
    description: '不方便判断',
    scene: 'closed',
    motionProfile: 'canopy-unknown'
  }
])
function withAssessmentDefaults(value = {}) {
  const input = sanitizeAirEnvironmentInput(value)
  const source = ['window', 'fresh_air'].includes(input.airExchange.source)
    ? input.airExchange.source
    : 'window'
  const airExchange = {
    source,
    windowDirectionCount:
      source === 'window'
        ? input.airExchange.windowDirectionCount || DEFAULT_WINDOW_DIRECTION_COUNT
        : null,
    windowOpenFrequency:
      source === 'window'
        ? input.airExchange.windowOpenFrequency || DEFAULT_WINDOW_OPEN_FREQUENCY
        : null
  }
  const mode = input.deviceAirflow.mode || (source === 'fresh_air' ? 'circulating' : 'none')
  return sanitizeAirEnvironmentInput({
    ...input,
    airExchange,
    deviceAirflow: { ...input.deviceAirflow, mode }
  })
}

function reconcileDeviceAirflowForExchange(airExchange, deviceAirflow, previousAirExchange) {
  const currentSources = Array.isArray(deviceAirflow?.sources) ? deviceAirflow.sources : []
  const currentDirectSources = Array.isArray(deviceAirflow?.directSources)
    ? deviceAirflow.directSources
    : []
  const sourceModes =
    deviceAirflow?.sourceModes && typeof deviceAirflow.sourceModes === 'object'
      ? { ...deviceAirflow.sourceModes }
      : Object.fromEntries(
          currentSources.map(source => [
            source,
            currentDirectSources.includes(source) ? 'direct' : 'circulating'
          ])
        )
  if (airExchange?.source === 'fresh_air') {
    sourceModes.fresh_air ||= 'circulating'
    const sources = Object.keys(sourceModes)
    const directSources = sources.filter(source => sourceModes[source] === 'direct')
    return {
      mode: directSources.length ? 'direct' : 'circulating',
      sources,
      directSources,
      sourceModes
    }
  }

  const returnedFromDefaultFreshAir =
    previousAirExchange?.source === 'fresh_air' &&
    deviceAirflow?.mode === 'circulating' &&
    currentSources.length === DEFAULT_FRESH_AIR_SOURCE_COUNT &&
    currentSources[FIRST_SOURCE_INDEX] === 'fresh_air'
  if (returnedFromDefaultFreshAir) {
    return { mode: 'none', sources: [], directSources: [], sourceModes: {} }
  }

  delete sourceModes.fresh_air
  const sources = Object.keys(sourceModes)
  const directSources = sources.filter(source => sourceModes[source] === 'direct')
  return {
    mode: directSources.length
      ? 'direct'
      : sources.length
        ? 'circulating'
        : deviceAirflow?.mode || 'none',
    sources,
    directSources,
    sourceModes
  }
}

const environment = ref(withAssessmentDefaults(props.modelValue))
let lastCommittedSignature = getAirEnvironmentSignature(environment.value)
const exchangeReady = computed(() => isAirExchangeAnswerReady(environment.value.airExchange))
const environmentReady = computed(() => isAirEnvironmentAnswerReady(environment.value))
const resolvedBackId = computed(() => props.backId || `${props.idPrefix}-back`)
const resolvedCompletionId = computed(() => props.completionId || `${props.idPrefix}-complete`)
const insightMessages = computed(() => {
  const messages = []
  if (environment.value.canopyOpenness === 'open') {
    messages.push('💨 周围开阔，气流通畅。叶面湿气容易散去，病害风险较低。')
  } else if (environment.value.canopyOpenness === 'partial') {
    messages.push('💨 一侧有遮挡，气流会受到影响。留意叶片密集处的湿气。')
  } else if (environment.value.canopyOpenness === 'enclosed') {
    messages.push('💨 周围遮挡较多，空气不易流动。建议给植物留出通风空间。')
  }
  if (environment.value.deviceAirflow.mode === 'direct') {
    messages.push('⚑ 持续直吹易失水。叶缘焦枯多与此相关，建议错开风口或加装挡风板。')
  } else if (environment.value.deviceAirflow.mode === 'circulating') {
    messages.push('💨 有空气流动但不直吹，能帮助叶面湿气散去。')
  }
  if (!messages.length) {
    messages.push('💨 当前环境已记录；如果位置或设备风发生变化，可以重新修改。')
  }
  return messages
})

function commit(value) {
  environment.value = withAssessmentDefaults(value)
  lastCommittedSignature = getAirEnvironmentSignature(environment.value)
  emit('update:modelValue', environment.value)
  emit('change', environment.value)
}

function setActiveStep(step) {
  const nextStep = Math.min(
    Math.max(Number(step) || AIR_EXCHANGE_STEP, AIR_EXCHANGE_STEP),
    LOCAL_AIRFLOW_STEP
  )
  if (activeStep.value === nextStep) {
    return
  }
  activeStep.value = nextStep
  emit('step-change', nextStep)
}

function nextStep() {
  if (props.disabled || activeStep.value !== AIR_EXCHANGE_STEP || !exchangeReady.value) {
    return false
  }
  setActiveStep(LOCAL_AIRFLOW_STEP)
  return true
}

function previousStep() {
  if (props.disabled || activeStep.value !== LOCAL_AIRFLOW_STEP) {
    return false
  }
  setActiveStep(AIR_EXCHANGE_STEP)
  return true
}

function goBack() {
  if (props.disabled) {
    return false
  }
  emit('back')
  return true
}

function complete() {
  if (props.disabled || !environmentReady.value || !props.completionLabel) {
    return false
  }
  emit('complete', environment.value)
  return true
}

function handleAirExchangeChange(airExchange) {
  const deviceAirflow = reconcileDeviceAirflowForExchange(
    airExchange,
    environment.value.deviceAirflow,
    environment.value.airExchange
  )
  commit({
    ...environment.value,
    airExchange,
    deviceAirflow
  })
}

function handleDeviceAirflowChange(deviceAirflow) {
  commit({ ...environment.value, deviceAirflow })
}

function selectCanopy(canopyOpenness) {
  if (!props.disabled) {
    commit({ ...environment.value, canopyOpenness })
  }
}

watch(
  () => props.modelValue,
  value => {
    const nextEnvironment = withAssessmentDefaults(value)
    const nextSignature = getAirEnvironmentSignature(nextEnvironment)
    const changedOutside = nextSignature !== lastCommittedSignature
    environment.value = nextEnvironment
    lastCommittedSignature = nextSignature
    if (changedOutside) {
      setActiveStep(AIR_EXCHANGE_STEP)
    }
  },
  { deep: true }
)

defineExpose({
  activeStep,
  nextStep,
  previousStep,
  goBack,
  complete,
  exchangeReady
})

onMounted(() => {
  if (getAirEnvironmentSignature(props.modelValue) !== lastCommittedSignature) {
    emit('update:modelValue', environment.value)
    emit('change', environment.value)
  }
  emit('step-change', activeStep.value)
})
</script>
