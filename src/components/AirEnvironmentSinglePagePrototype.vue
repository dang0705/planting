<template>
  <view
    :id="`${idPrefix}-single-page`"
    class="flex flex-col"
    :class="{ 'pointer-events-none opacity-60': disabled }"
  >
    <view class="rounded-2xl border border-[rgba(45,122,79,0.15)] bg-white p-5">
      <text class="block text-base font-semibold leading-6 text-[#0a0a0a]">
        植物周围的通风情况
      </text>
      <text class="mt-1 block text-xs leading-5 text-[#5a7a68]">
        按平时最常见的情况选择，几步就能完成记录
      </text>

      <view
        :id="`${idPrefix}-single-exchange-group`"
        class="mt-4 rounded-2xl border border-[rgba(45,122,79,0.15)] p-3"
      >
        <AirEnvironmentSinglePageExchange
          :id-prefix="idPrefix"
          :model-value="environment.airExchange"
          :disabled="disabled"
          @change="handleAirExchangeChange"
        />
      </view>

      <view
        :id="`${idPrefix}-single-canopy-group`"
        class="mt-3 rounded-2xl border border-[rgba(45,122,79,0.15)] p-3"
      >
        <text class="block text-sm font-semibold leading-5 text-[#0a0a0a]">
          植物周围是否有遮挡？
        </text>
        <text class="mt-1 block text-xs leading-5 text-[#5a7a68]">
          只看植物附近被墙、柜子或其他植物挡住的程度
        </text>
        <AirEnvironmentSinglePageSplitChoice
          :id="`${idPrefix}-single-canopy`"
          :scene-id="`${idPrefix}-single-canopy-scene`"
          :label="canopyPreviewOption.label"
          :description="canopyPreviewOption.description"
          :scene="canopyPreviewOption.scene"
          :motion-profile="canopyPreviewOption.motionProfile"
          :is-unknown="canopyPreviewOption.key === 'unknown'"
          :selected="Boolean(environment.canopyOpenness)"
          :disabled="disabled"
        >
          <view class="min-w-0 rounded-xl border border-[rgba(45,122,79,0.15)] bg-white p-2">
            <view class="flex flex-wrap gap-1">
              <view
                v-for="option in canopyOptions"
                :id="`${idPrefix}-single-canopy-${option.key}`"
                :key="option.key"
                class="flex min-w-[48%] flex-[1_1_48%] items-center justify-center gap-1 rounded-lg border px-1 py-1"
                :class="
                  environment.canopyOpenness === option.key
                    ? 'border-brand bg-[#e8f5e9] text-[#2d7a4f]'
                    : 'border-[rgba(45,122,79,0.12)] text-[#5a7a68]'
                "
                :aria-label="option.label"
                :aria-checked="environment.canopyOpenness === option.key"
                @click="selectCanopy(option.key)"
              >
                <text
                  class="min-w-0 break-words whitespace-normal text-center text-[10px] leading-4"
                >
                  {{ option.controlLabel }}
                </text>
              </view>
            </view>
          </view>
        </AirEnvironmentSinglePageSplitChoice>
      </view>

      <view
        :id="`${idPrefix}-single-device-group`"
        class="mt-3 rounded-2xl border border-[rgba(45,122,79,0.15)] p-3"
      >
        <text class="block text-sm font-semibold leading-5 text-[#0a0a0a]">
          植物附近有设备风吗？
        </text>
        <text class="mt-1 block text-xs leading-5 text-[#5a7a68]">
          只有实际到达植物附近的设备风才需要记录
        </text>
        <AirEnvironmentSinglePageSplitChoice
          :id="`${idPrefix}-single-device`"
          :scene-id="`${idPrefix}-single-device-scene`"
          :label="devicePreviewOption.label"
          :description="devicePreviewOption.description"
          :scene="devicePreviewOption.scene"
          :motion-profile="devicePreviewOption.motionProfile"
          scene-aspect-ratio="1.4444"
          scene-width-class="w-full"
          scene-column-class="flex-[3]"
          controls-column-class="flex-[2]"
          :device-sources="requiresDeviceSource ? selectedDeviceSources : null"
          :is-unknown="devicePreviewOption.key === 'unknown'"
          :selected="Boolean(environment.deviceAirflow.mode)"
          :disabled="disabled"
        >
          <view class="min-w-0 rounded-xl border border-[rgba(45,122,79,0.15)] bg-white p-2">
            <view class="flex flex-wrap gap-1">
              <view
                v-for="option in deviceOptions"
                :id="`${idPrefix}-single-device-mode-${option.key}`"
                :key="option.key"
                class="flex min-w-[31%] flex-[1_1_31%] items-center justify-center gap-0.5 rounded-lg border px-0 py-1"
                :class="[
                  devicePresenceDisabled(option.key)
                    ? 'border-[rgba(169,184,174,0.45)] text-[#a9b8ae]'
                    : isDevicePresenceSelected(option.key)
                      ? 'border-brand bg-[#e8f5e9] text-[#2d7a4f]'
                      : 'border-[rgba(45,122,79,0.12)] text-[#5a7a68]',
                  isDevicePresenceSelected(option.key) && devicePresenceDisabled(option.key)
                    ? 'bg-[#eef3ef]'
                    : ''
                ]"
                :aria-label="option.label"
                :aria-checked="isDevicePresenceSelected(option.key)"
                :aria-disabled="devicePresenceDisabled(option.key)"
                @click="selectDevicePresence(option.key)"
              >
                <text
                  class="min-w-0 break-words whitespace-normal text-center text-[10px] leading-4"
                >
                  {{ option.controlLabel }}
                </text>
              </view>
            </view>
          </view>

          <view
            v-if="requiresDeviceSource"
            :id="`${idPrefix}-single-device-sources`"
            class="min-w-0 rounded-xl border border-[rgba(45,122,79,0.15)] bg-white p-2"
          >
            <text class="block text-[10px] font-medium leading-4 text-[#5a7a68]">
              设备风（可多选）
            </text>
            <text class="mt-0.5 block text-[9px] leading-3 text-[#7a9182]">不选表示不到植物</text>
            <view class="mt-1 flex flex-col gap-1">
              <view
                v-for="device in deviceSourceOptions"
                :id="`${idPrefix}-single-device-source-${device.key}`"
                :key="device.key"
                class="flex min-w-0 items-center gap-1 rounded-lg border border-[rgba(45,122,79,0.12)] px-1 py-1"
              >
                <view class="flex w-9 shrink-0 flex-col items-center gap-0.5">
                  <text class="block text-[10px] font-medium leading-4 text-[#1f3d2c]">
                    {{ device.label }}
                  </text>
                  <view
                    v-if="device.key !== 'fresh_air'"
                    :id="`${idPrefix}-single-device-source-${device.key}-toggle`"
                    class="flex h-5 w-5 items-center justify-center rounded-md border"
                    :class="
                      isSourceSelected(device.key)
                        ? 'border-brand bg-[#e8f5e9] text-[#2d7a4f]'
                        : 'border-[rgba(45,122,79,0.2)] bg-white text-transparent'
                    "
                    :aria-label="`${device.label}的风到达植物`"
                    :aria-checked="isSourceSelected(device.key)"
                    :aria-disabled="disabled"
                    @click="toggleSourceSelection(device.key)"
                  >
                    <text class="text-[12px] font-bold leading-4">
                      {{ isSourceSelected(device.key) ? '✓' : '' }}
                    </text>
                  </view>
                </view>
                <view class="flex min-w-0 flex-1 flex-wrap gap-1">
                  <view
                    v-for="relation in sourceRelationOptions"
                    :id="`${idPrefix}-single-device-source-${device.key}-${relation.key}`"
                    :key="relation.key"
                    class="flex min-w-[48%] flex-[1_1_48%] items-center justify-center rounded-md border px-1 py-1 text-[9px] leading-3"
                    :class="
                      sourceRelationDisabled(device.key, relation.key)
                        ? 'border-[rgba(169,184,174,0.45)] text-[#a9b8ae]'
                        : sourceMode(device.key) === relation.key
                          ? 'border-brand bg-[#e8f5e9] font-medium text-[#2d7a4f]'
                          : 'border-[rgba(45,122,79,0.12)] text-[#5a7a68]'
                    "
                    :aria-checked="sourceMode(device.key) === relation.key"
                    :aria-disabled="sourceRelationDisabled(device.key, relation.key)"
                    @click="selectSourceMode(device.key, relation.key)"
                  >
                    <text class="break-words whitespace-normal text-center">{{
                      relation.controlLabel
                    }}</text>
                  </view>
                </view>
              </view>
            </view>
            <text
              v-if="!environment.deviceAirflow.sources.length"
              class="mt-2 block text-[10px] leading-4 text-[#b45309]"
            >
              都不到植物？请选择“没有设备风”
            </text>
          </view>
        </AirEnvironmentSinglePageSplitChoice>
      </view>

      <view :id="`${idPrefix}-single-summary`" class="mt-5 rounded-2xl bg-[#f8faf9] px-3 py-3">
        <text class="block text-xs font-medium leading-5 text-[#5a7a68]">当前记录</text>
        <text class="mt-1 block text-sm leading-5 text-[#0a0a0a]">{{ summary }}</text>
      </view>
    </view>

    <view v-if="!hideNavigation" :id="`${idPrefix}-single-navigation`" class="mt-4 flex gap-3">
      <button
        v-if="backLabel"
        :id="resolvedBackId"
        class="m-0 h-[52px] flex-1 rounded-2xl border border-[#2d7a4f] bg-white p-0 text-base font-bold leading-[52px] text-[#2d7a4f]"
        :disabled="disabled"
        @click="goBack"
      >
        {{ backLabel }}
      </button>
      <button
        v-if="completionLabel"
        :id="resolvedCompletionId"
        class="m-0 h-[52px] rounded-2xl bg-[#2d7a4f] p-0 text-base font-bold leading-[52px] text-white"
        :class="backLabel ? 'flex-[2]' : 'w-full'"
        :disabled="disabled || !environmentReady"
        @click="complete"
      >
        {{ completionLabel }}
      </button>
    </view>
  </view>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import AirEnvironmentSinglePageExchange from '@/components/AirEnvironmentSinglePageExchange.vue'
import AirEnvironmentSinglePageSplitChoice from '@/components/AirEnvironmentSinglePageSplitChoice.vue'
import {
  createInitialAirEnvironmentInput,
  getAirEnvironmentSignature,
  isAirEnvironmentAnswerReady,
  sanitizeAirEnvironmentInput
} from '@/utils/air-environment.js'

const props = defineProps({
  modelValue: { type: Object, default: () => createInitialAirEnvironmentInput() },
  idPrefix: { type: String, default: 'air-environment' },
  disabled: { type: Boolean, default: false },
  hideNavigation: { type: Boolean, default: false },
  backLabel: { type: String, default: '' },
  backId: { type: String, default: '' },
  completionLabel: { type: String, default: '' },
  completionId: { type: String, default: '' }
})
const emit = defineEmits(['update:modelValue', 'change', 'back', 'complete'])

const canopyOptions = Object.freeze([
  {
    key: 'open',
    label: '无遮挡',
    controlLabel: '无',
    description: '植物周围留有空间',
    scene: 'closed',
    motionProfile: 'canopy-open'
  },
  {
    key: 'partial',
    label: '有些遮挡',
    controlLabel: '有些',
    description: '一侧靠墙、柜子或家具',
    scene: 'closed',
    motionProfile: 'canopy-partial'
  },
  {
    key: 'enclosed',
    label: '遮挡较多',
    controlLabel: '较多',
    description: '墙角、柜边或周围植物较密',
    scene: 'closed',
    motionProfile: 'canopy-enclosed'
  },
  {
    key: 'unknown',
    label: '不确定',
    controlLabel: '不确定',
    description: '不方便判断周围是否开阔',
    scene: 'closed',
    motionProfile: 'canopy-unknown'
  }
])
const deviceOptions = Object.freeze([
  {
    key: 'has_airflow',
    label: '有',
    controlLabel: '有',
    description: '逐个判断设备的风',
    scene: 'closed',
    motionProfile: 'device-circulating'
  },
  {
    key: 'none',
    label: '没有设备风',
    controlLabel: '无',
    description: '设备风不到植物',
    scene: 'closed',
    motionProfile: 'device-none'
  },
  {
    key: 'unknown',
    label: '不确定',
    controlLabel: '不确定',
    description: '不清楚设备风是否到达',
    scene: 'closed',
    motionProfile: 'device-unknown'
  }
])
const environment = ref(sanitizeAirEnvironmentInput(props.modelValue))
let lastCommittedSignature = getAirEnvironmentSignature(environment.value)

const requiresDeviceSource = computed(() =>
  ['circulating', 'direct'].includes(environment.value.deviceAirflow.mode)
)
const deviceSourceOptions = computed(() => {
  const options = [
    { key: 'fan', label: '风扇' },
    { key: 'air_conditioner', label: '空调' }
  ]
  if (environment.value.airExchange.source === 'fresh_air') {
    options.push({
      key: 'fresh_air',
      label: '新风'
    })
  }
  return options
})
const selectedDeviceSources = computed(() =>
  deviceSourceOptions.value
    .map(device => ({
      ...device,
      relation: sourceMode(device.key)
    }))
    .filter(device => ['circulating', 'direct'].includes(device.relation))
)
const sourceRelationOptions = Object.freeze([
  { key: 'circulating', controlLabel: '不直吹' },
  { key: 'direct', controlLabel: '直吹' }
])
const SINGLE_SOURCE_MODE_COUNT = 1
const rememberedDeviceSourceModes = ref(
  cloneKnownSourceModes(environment.value.deviceAirflow.sourceModes)
)
const canopyPreviewOption = computed(
  () =>
    canopyOptions.find(option => option.key === environment.value.canopyOpenness) || {
      key: 'unknown',
      label: '待选择',
      description: '',
      scene: 'closed',
      motionProfile: 'canopy-unknown'
    }
)
const devicePreviewOption = computed(
  () =>
    deviceOptions.find(option => option.key === environment.value.deviceAirflow.mode) ||
    (['circulating', 'direct'].includes(environment.value.deviceAirflow.mode)
      ? deviceOptions.find(option => option.key === 'has_airflow')
      : {
          key: 'unknown',
          label: '待选择',
          description: '',
          scene: 'closed',
          motionProfile: 'device-unknown'
        })
)
const environmentReady = computed(() => isAirEnvironmentAnswerReady(environment.value))
const resolvedBackId = computed(() => props.backId || `${props.idPrefix}-back`)
const resolvedCompletionId = computed(() => props.completionId || `${props.idPrefix}-complete`)
const summary = computed(() => {
  const canopy = canopyOptions.find(
    option => option.key === environment.value.canopyOpenness
  )?.label
  const deviceRelations = deviceSourceOptions.value
    .map(device => {
      const relation = sourceRelationOptions.find(option => option.key === sourceMode(device.key))
      if (!relation) {
        return `${device.label}不到植物`
      }
      return `${device.label}${relation.key === 'direct' ? '直吹' : '不直吹'}`
    })
    .filter(Boolean)
  const device =
    environment.value.deviceAirflow.mode === 'none'
      ? '没有设备风'
      : environment.value.deviceAirflow.mode === 'unknown'
        ? '设备风不确定'
        : deviceRelations.length
          ? deviceRelations.join('、')
          : '设备风待判断'
  const exchange = environment.value.airExchange.source
    ? environment.value.airExchange.source === 'fresh_air'
      ? '主要靠新风'
      : environment.value.airExchange.windowOpenFrequency === 'almost_never'
        ? '平时几乎不开窗'
        : environment.value.airExchange.source === 'window'
          ? '主要靠开窗'
          : '换气方式不确定'
    : '换气方式待选择'
  return [exchange, canopy || '周围空间待选择', device || '设备风待选择'].join(' · ')
})

function commit(value) {
  environment.value = sanitizeAirEnvironmentInput(value)
  lastCommittedSignature = getAirEnvironmentSignature(environment.value)
  emit('update:modelValue', environment.value)
  emit('change', environment.value)
}

function handleAirExchangeChange(airExchange) {
  const current = environment.value.deviceAirflow
  const sourceModes = { ...current.sourceModes }
  if (airExchange?.source === 'fresh_air') {
    sourceModes.fresh_air ||= rememberedDeviceSourceModes.value.fresh_air || 'circulating'
  } else {
    delete sourceModes.fresh_air
  }
  const sources = Object.keys(sourceModes)
  const directSources = sources.filter(source => sourceModes[source] === 'direct')
  commit({
    ...environment.value,
    airExchange,
    deviceAirflow: {
      ...current,
      mode: directSources.length ? 'direct' : sources.length ? 'circulating' : current.mode,
      sources,
      directSources,
      sourceModes
    }
  })
}

function selectCanopy(key) {
  if (!props.disabled) {
    commit({ ...environment.value, canopyOpenness: key })
  }
}

function devicePresenceDisabled(presence) {
  return (
    props.disabled ||
    (environment.value.airExchange.source === 'fresh_air' && ['none', 'unknown'].includes(presence))
  )
}

function isDevicePresenceSelected(presence) {
  if (presence === 'has_airflow') {
    return ['circulating', 'direct'].includes(environment.value.deviceAirflow.mode)
  }
  return environment.value.deviceAirflow.mode === presence
}

function cloneKnownSourceModes(sourceModes) {
  return Object.fromEntries(
    Object.entries(sourceModes || {}).filter(([, relation]) =>
      sourceRelationOptions.some(option => option.key === relation)
    )
  )
}

function hasOwn(sourceModes, source) {
  return Object.prototype.hasOwnProperty.call(sourceModes, source)
}

function getDeviceSourceModesForSelection() {
  const currentSourceModes = cloneKnownSourceModes(environment.value.deviceAirflow.sourceModes)
  const rememberedSourceModes = rememberedDeviceSourceModes.value
  const hasStoredSourceModes =
    Boolean(Object.keys(currentSourceModes).length) ||
    Boolean(Object.keys(rememberedSourceModes).length)
  const hasOnlyAutomaticFreshAir =
    !Object.keys(rememberedSourceModes).length &&
    Object.keys(currentSourceModes).length === SINGLE_SOURCE_MODE_COUNT &&
    currentSourceModes.fresh_air === 'circulating'
  const shouldUseDefaults = !hasStoredSourceModes || hasOnlyAutomaticFreshAir
  const sourceModes = {}

  for (const device of deviceSourceOptions.value) {
    if (hasOwn(rememberedSourceModes, device.key)) {
      if (rememberedSourceModes[device.key]) {
        sourceModes[device.key] = rememberedSourceModes[device.key]
      }
      continue
    }
    if (hasOwn(currentSourceModes, device.key)) {
      sourceModes[device.key] = currentSourceModes[device.key]
      continue
    }
    if (shouldUseDefaults) {
      sourceModes[device.key] = 'circulating'
    }
  }

  return sourceModes
}

function selectDevicePresence(presence) {
  if (devicePresenceDisabled(presence)) {
    return
  }
  if (presence === 'has_airflow') {
    const sourceModes = getDeviceSourceModesForSelection()
    rememberedDeviceSourceModes.value = { ...rememberedDeviceSourceModes.value, ...sourceModes }
    const sources = Object.keys(sourceModes)
    const directSources = sources.filter(source => sourceModes[source] === 'direct')
    commit({
      ...environment.value,
      deviceAirflow: {
        ...environment.value.deviceAirflow,
        mode: directSources.length ? 'direct' : 'circulating',
        sources,
        directSources,
        sourceModes
      }
    })
    return
  }
  commit({
    ...environment.value,
    deviceAirflow: {
      mode: presence,
      sources: [],
      directSources: [],
      sourceModes: {}
    }
  })
}

function sourceMode(source) {
  return environment.value.deviceAirflow.sourceModes?.[source] || null
}

function isSourceSelected(source) {
  return Boolean(sourceMode(source))
}

function sourceRelationDisabled(source) {
  return props.disabled || !isSourceSelected(source)
}

function commitSourceModes(sourceModes) {
  const sources = Object.keys(sourceModes)
  const directSources = sources.filter(item => sourceModes[item] === 'direct')
  commit({
    ...environment.value,
    deviceAirflow: {
      ...environment.value.deviceAirflow,
      mode: directSources.length ? 'direct' : 'circulating',
      sources,
      directSources,
      sourceModes
    }
  })
}

function toggleSourceSelection(source) {
  if (props.disabled || !requiresDeviceSource.value) {
    return
  }
  const sourceModes = { ...environment.value.deviceAirflow.sourceModes }
  if (isSourceSelected(source)) {
    delete sourceModes[source]
    rememberedDeviceSourceModes.value = {
      ...rememberedDeviceSourceModes.value,
      [source]: null
    }
  } else {
    sourceModes[source] = rememberedDeviceSourceModes.value[source] || 'circulating'
    rememberedDeviceSourceModes.value = {
      ...rememberedDeviceSourceModes.value,
      [source]: sourceModes[source]
    }
  }
  commitSourceModes(sourceModes)
}

function selectSourceMode(source, relation) {
  if (sourceRelationDisabled(source, relation) || !requiresDeviceSource.value) {
    return
  }
  const sourceModes = { ...environment.value.deviceAirflow.sourceModes }
  sourceModes[source] = relation
  rememberedDeviceSourceModes.value = {
    ...rememberedDeviceSourceModes.value,
    [source]: relation
  }
  commitSourceModes(sourceModes)
}

function goBack() {
  if (!props.disabled) {
    emit('back')
  }
}

function complete() {
  if (!props.disabled && environmentReady.value && props.completionLabel) {
    emit('complete', environment.value)
  }
}

watch(
  () => props.modelValue,
  value => {
    const nextEnvironment = sanitizeAirEnvironmentInput(value)
    const nextSignature = getAirEnvironmentSignature(nextEnvironment)
    environment.value = nextEnvironment
    if (nextSignature !== lastCommittedSignature) {
      rememberedDeviceSourceModes.value = cloneKnownSourceModes(
        nextEnvironment.deviceAirflow.sourceModes
      )
    }
    lastCommittedSignature = nextSignature
  },
  { deep: true }
)

defineExpose({ environmentReady, complete })
</script>
