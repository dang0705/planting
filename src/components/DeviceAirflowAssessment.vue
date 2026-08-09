<template>
  <view :id="`${idPrefix}-device-assessment`">
    <text class="block text-sm font-semibold leading-6 text-[#0a0a0a]">
      哪些设备的风会到达植物？
    </text>
    <text class="mt-1 block text-xs leading-5 text-[#5a7a68]">
      每种设备分别判断，避免把不同设备的风混在一起
    </text>

    <view class="mt-3 grid grid-cols-2 gap-2">
      <AirEnvironmentOptionCard
        :id="`${idPrefix}-device-mode-none`"
        :label="devicePresenceOptions.none.label"
        :description="devicePresenceOptions.none.description"
        :scene="devicePresenceOptions.none.scene"
        :motion-profile="devicePresenceOptions.none.motionProfile"
        :selected="devicePresenceSelection === 'none'"
        :show-selection-indicator="false"
        orientation="vertical"
        :description-lines="2"
        :disabled="devicePresenceDisabled('none')"
        @select="selectDevicePresence('none')"
      />

      <AirEnvironmentOptionCard
        :id="`${idPrefix}-device-mode-unknown`"
        :label="devicePresenceOptions.unknown.label"
        :description="devicePresenceOptions.unknown.description"
        :scene="devicePresenceOptions.unknown.scene"
        :motion-profile="devicePresenceOptions.unknown.motionProfile"
        is-unknown
        :selected="devicePresenceSelection === 'unknown'"
        :show-selection-indicator="false"
        orientation="vertical"
        :description-lines="2"
        :disabled="devicePresenceDisabled('unknown')"
        @select="selectDevicePresence('unknown')"
      />
    </view>

    <view
      :id="`${idPrefix}-device-mode-has-airflow`"
      class="mt-2 rounded-2xl border p-[13px]"
      :class="
        devicePresenceSelection === 'has-airflow'
          ? 'border-[#2d7a4f] bg-[#e8f5e9]'
          : 'border-[rgba(45,122,79,0.15)] bg-white'
      "
      :aria-checked="devicePresenceSelection === 'has-airflow'"
      @click="selectDevicePresence('has-airflow')"
    >
      <view class="flex items-start justify-between gap-3">
        <view class="min-w-0 flex-1">
          <text class="block text-sm font-medium leading-5 text-[#0a0a0a]">
            {{ devicePresenceOptions.hasAirflow.label }}
          </text>
          <text class="mt-1 block text-xs leading-[17px] text-[#5a7a68]">
            {{ devicePresenceOptions.hasAirflow.description }}
          </text>
        </view>
        <text
          v-if="devicePresenceSelection === 'has-airflow'"
          class="shrink-0 text-xs font-medium leading-5 text-[#2d7a4f]"
        >
          已选择
        </text>
      </view>

      <view
        v-if="requiresDeviceSource"
        :id="`${idPrefix}-device-sources`"
        class="mt-3 rounded-xl border border-[rgba(45,122,79,0.15)] bg-white p-3"
        @click.stop
      >
        <text class="block text-sm font-medium leading-5 text-[#0a0a0a]">
          分别判断每种设备（可多选）
        </text>
        <text class="mt-1 block text-xs leading-5 text-[#5a7a68]">
          只选到达植物的设备，再选不直吹或直吹；不选表示不到植物
        </text>
        <view
          v-for="source in deviceSourceOptions"
          :id="`${idPrefix}-device-source-${source.key}`"
          :key="source.key"
          class="mt-3 rounded-xl border border-[rgba(45,122,79,0.12)] p-2"
        >
          <text class="block text-xs font-medium leading-5 text-[#1f3d2c]">{{ source.label }}</text>
          <view class="mt-1 flex flex-wrap gap-1">
            <view
              v-for="relation in sourceRelationOptions"
              :id="`${idPrefix}-device-source-${source.key}-${relation.key}`"
              :key="relation.key"
              class="flex min-w-[48%] flex-[1_1_48%] items-center justify-center rounded-lg border px-1 text-[10px] leading-4"
              :class="
                sourceRelationDisabled(source.key, relation.key)
                  ? 'border-[rgba(169,184,174,0.45)] text-[#a9b8ae]'
                  : sourceMode(source.key) === relation.key
                    ? 'border-brand bg-[#e8f5e9] font-medium text-[#2d7a4f]'
                    : 'border-[rgba(45,122,79,0.12)] text-[#5a7a68]'
              "
              :aria-checked="sourceMode(source.key) === relation.key"
              :aria-disabled="sourceRelationDisabled(source.key, relation.key)"
              @click="selectSourceMode(source.key, relation.key)"
            >
              <text class="break-words whitespace-normal text-center">{{ relation.label }}</text>
            </view>
          </view>
        </view>
        <text v-if="!airflow.sources.length" class="mt-2 block text-xs leading-5 text-[#b45309]">
          都不到植物？请选择“没有设备风”
        </text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import AirEnvironmentOptionCard from '@/components/AirEnvironmentOptionCard.vue'
import { sanitizeAirEnvironmentInput } from '@/utils/air-environment.js'

const props = defineProps({
  modelValue: { type: Object, default: () => ({ mode: null, sources: [], sourceModes: {} }) },
  airExchange: { type: Object, default: () => ({ source: null }) },
  idPrefix: { type: String, default: 'air-environment-device' },
  disabled: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue', 'change'])

const devicePresenceOptions = Object.freeze({
  none: {
    label: '没有设备风',
    description: '没有设备风到达植物',
    scene: 'closed',
    motionProfile: 'device-none'
  },
  hasAirflow: {
    label: '有',
    description: '逐个判断设备的风',
    scene: 'closed',
    motionProfile: 'device-circulating'
  },
  unknown: {
    label: '不确定',
    description: '不清楚设备风是否到达',
    scene: 'closed',
    motionProfile: 'device-unknown'
  }
})
const sourceRelationOptions = Object.freeze([
  { key: 'circulating', label: '不直吹' },
  { key: 'direct', label: '直吹' }
])
const deviceSourceOptions = computed(() => {
  const options = [
    { key: 'fan', label: '风扇' },
    { key: 'air_conditioner', label: '空调' }
  ]
  if (props.airExchange?.source === 'fresh_air') {
    options.push({ key: 'fresh_air', label: '新风' })
  }
  return options
})

function normalizeDeviceAirflow(value, airExchange) {
  return sanitizeAirEnvironmentInput({ airExchange, deviceAirflow: value }).deviceAirflow
}

const airflow = ref(normalizeDeviceAirflow(props.modelValue, props.airExchange))
const requiresDeviceSource = computed(() => ['circulating', 'direct'].includes(airflow.value.mode))
const devicePresenceSelection = computed(() => {
  if (['circulating', 'direct'].includes(airflow.value.mode)) {
    return 'has-airflow'
  }
  if (airflow.value.mode === 'none') {
    return 'none'
  }
  if (airflow.value.mode === 'unknown') {
    return 'unknown'
  }
  return null
})

function commit(value) {
  airflow.value = normalizeDeviceAirflow(value, props.airExchange)
  emit('update:modelValue', airflow.value)
  emit('change', airflow.value)
}

function devicePresenceDisabled(presence) {
  return (
    props.disabled ||
    (props.airExchange?.source === 'fresh_air' && ['none', 'unknown'].includes(presence))
  )
}

function selectDevicePresence(presence) {
  if (devicePresenceDisabled(presence)) {
    return
  }
  if (presence === 'has-airflow') {
    commit({
      ...airflow.value,
      mode: ['circulating', 'direct'].includes(airflow.value.mode)
        ? airflow.value.mode
        : 'circulating',
      sourceModes: airflow.value.sourceModes || {}
    })
    return
  }
  commit({ mode: presence, sources: [], directSources: [], sourceModes: {} })
}

function sourceMode(source) {
  return airflow.value.sourceModes?.[source] || null
}

function sourceRelationDisabled() {
  return props.disabled
}

function selectSourceMode(source, relation) {
  if (sourceRelationDisabled(source, relation) || !requiresDeviceSource.value) {
    return
  }
  const sourceModes = { ...airflow.value.sourceModes }
  if (sourceModes[source] === relation) {
    delete sourceModes[source]
  } else {
    sourceModes[source] = relation
  }
  const sources = Object.keys(sourceModes)
  const directSources = sources.filter(item => sourceModes[item] === 'direct')
  commit({
    ...airflow.value,
    mode: directSources.length ? 'direct' : 'circulating',
    sources,
    directSources,
    sourceModes
  })
}

watch(
  [() => props.modelValue, () => props.airExchange],
  ([nextValue, nextAirExchange]) => {
    airflow.value = normalizeDeviceAirflow(nextValue, nextAirExchange)
  },
  { deep: true }
)
</script>
