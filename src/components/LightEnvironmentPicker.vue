<template>
  <view
    :id="`${idPrefix}-environment-${questionId}`"
    :class="{ 'pointer-events-none opacity-60': disabled }"
  >
    <view v-if="showTitle" class="mb-3.5">
      <text class="block text-[17px] font-medium leading-6 text-[#1c2921]">
        请告诉我【{{ plantName || '植物' }}】实际接收到的光
      </text>
      <text class="mt-1.5 block text-[13px] leading-5 text-[#5c8066]">
        只看植物旁：有没有晒到叶片、周围亮不亮
      </text>
    </view>

    <view
      :id="`${idPrefix}-illustration-${questionId}`"
      class="mb-3.5 flex h-[156px] flex-col items-center overflow-hidden rounded-xl border border-[#e0f0e5] bg-[#fbfdfc] px-3 py-2"
    >
      <image
        :src="activeIllustration"
        class="light-environment-picker-illustration h-[116px] w-full"
        mode="aspectFit"
      />
      <text class="mt-1 block text-center text-[13px] leading-5 text-[#3b754d]">
        {{ activeOption.label }}：{{ activeOption.description }}
      </text>
    </view>

    <text class="mb-2 block text-sm font-medium leading-5 text-[#24382b]">光线进入方式</text>
    <view class="mb-3.5 flex gap-1.5">
      <view
        v-for="entry in entryMethodOptions"
        :id="`${idPrefix}-entry-${entry.key}-${questionId}`"
        :key="entry.key"
        class="box-border flex h-[52px] flex-1 items-center justify-center rounded-xl px-4"
        :class="entryMethodClass(entry.key)"
        @click="selectEntryMethod(entry.key)"
      >
        <text class="whitespace-nowrap text-center text-sm font-medium leading-5">
          {{ entry.label }}
        </text>
      </view>
    </view>

    <text class="mb-2 block text-sm font-medium leading-5 text-[#24382b]"> 选择最接近的一种 </text>
    <view class="flex flex-col gap-1.5">
      <view
        v-for="option in lightTypeOptions"
        :id="`${idPrefix}-type-${option.key}-${questionId}`"
        :key="option.key"
        class="box-border flex h-[52px] w-full items-center rounded-xl px-4"
        :class="
          environment.naturalLightType === option.key
            ? 'border-2 border-[#2d7a4f] bg-[#fbfdfc]'
            : 'border border-[#d6e0d9] bg-white'
        "
        @click="selectNaturalLightType(option.key)"
      >
        <view class="flex min-w-0 flex-1 flex-col justify-center">
          <text class="block text-sm font-medium leading-5 text-[#1f2e24]">
            {{ option.label }}
          </text>
          <text class="block text-[11px] leading-4 text-[#63806b]">
            {{ option.description }}
          </text>
        </view>
      </view>
    </view>

    <view
      class="mt-3.5 flex h-14 items-center overflow-hidden rounded-xl border border-[#dbebe0] bg-[#f6fbf7] px-3 py-2.5"
    >
      <view class="min-w-0 flex-1">
        <text class="block text-sm font-medium leading-5 text-[#1f2e24]"> 使用补光灯（可选） </text>
        <text class="block text-[11px] leading-4 text-[#63806b]">
          可与上方任意自然光状态同时使用
        </text>
      </view>
      <switch
        :id="`${idPrefix}-supplemental-light-${questionId}`"
        :checked="environment.hasSupplementalLight"
        :disabled="disabled"
        color="#2d7a4f"
        @change="handleSupplementalLightChange"
      />
    </view>

    <text
      v-if="environment.hasSupplementalLight"
      class="mt-2 block text-[11px] leading-4 text-[#63806b]"
    >
      已记录补光灯，实际效果取决于灯具强度、距离和使用时长。
    </text>

    <button
      v-if="requiresConfirmation && !confirmed && hasSelectedLightType"
      :id="`${idPrefix}-confirm-current-${questionId}`"
      class="mt-3.5 h-11 w-full rounded-xl border border-[#2d7a4f] bg-[#fbfdfc] p-0 text-sm font-medium leading-[44px] text-[#2d7a4f]"
      @click="confirmCurrentEnvironment"
    >
      仍是这样
    </button>

    <text v-if="errorText" class="mt-2 block text-xs text-red-500">{{ errorText }}</text>
  </view>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import directIllustration from '@/assets/light/light-type-direct.svg'
import brightDiffuseIllustration from '@/assets/light/light-type-bright-diffuse.svg'
import weakDiffuseIllustration from '@/assets/light/light-type-weak-diffuse.svg'
import almostNoneIllustration from '@/assets/light/light-type-almost-none.svg'
import {
  ENTRY_METHOD_OPTIONS,
  NATURAL_LIGHT_TYPE_OPTIONS,
  createDefaultLightEnvironment,
  getLightEnvironmentSignature,
  getNaturalLightTypeOption,
  markLightEnvironmentAsUser,
  sanitizeLightEnvironment
} from '@/utils/light-environment.js'

const props = defineProps({
  modelValue: { type: Object, default: () => createDefaultLightEnvironment() },
  questionId: { type: [String, Number], default: 'default' },
  idPrefix: { type: String, default: 'light-environment' },
  plantName: { type: String, default: '植物' },
  showTitle: { type: Boolean, default: true },
  disabled: { type: Boolean, default: false },
  errorText: { type: String, default: '' },
  requiresConfirmation: { type: Boolean, default: false },
  confirmed: { type: Boolean, default: false }
})

const emit = defineEmits(['change', 'confirm'])
const illustrationByType = {
  direct: directIllustration,
  bright_diffuse: brightDiffuseIllustration,
  weak_diffuse: weakDiffuseIllustration,
  almost_none: almostNoneIllustration
}
const lightTypeOptions = NATURAL_LIGHT_TYPE_OPTIONS
const entryMethodOptions = ENTRY_METHOD_OPTIONS
const environment = ref(sanitizeLightEnvironment(props.modelValue))
const previousEntryMethod = ref(environment.value.entryMethod || 'through_glass')

const displayLightType = computed(() => environment.value.naturalLightType || 'direct')
const activeOption = computed(
  () => getNaturalLightTypeOption(displayLightType.value) || NATURAL_LIGHT_TYPE_OPTIONS[0]
)
const activeIllustration = computed(() => illustrationByType[displayLightType.value])
const hasSelectedLightType = computed(() => Boolean(environment.value.naturalLightType))
const entryMethodDisabled = computed(() => environment.value.naturalLightType === 'almost_none')

watch(
  () => props.modelValue,
  value => {
    const next = sanitizeLightEnvironment(value)
    if (getLightEnvironmentSignature(next) !== getLightEnvironmentSignature(environment.value)) {
      environment.value = next
      if (next.entryMethod) {
        previousEntryMethod.value = next.entryMethod
      }
    }
  },
  { deep: true }
)

function commit(value) {
  environment.value = markLightEnvironmentAsUser(value)
  emit('change', environment.value)
}

function selectNaturalLightType(naturalLightType) {
  if (props.disabled) {
    return
  }
  const leavingAlmostNone =
    environment.value.naturalLightType === 'almost_none' && naturalLightType !== 'almost_none'
  if (naturalLightType === 'almost_none' && environment.value.entryMethod) {
    previousEntryMethod.value = environment.value.entryMethod
  }
  commit({
    ...environment.value,
    naturalLightType,
    entryMethod:
      naturalLightType === 'almost_none'
        ? null
        : leavingAlmostNone
          ? previousEntryMethod.value || 'through_glass'
          : environment.value.entryMethod || 'through_glass'
  })
}

function selectEntryMethod(entryMethod) {
  if (props.disabled || entryMethodDisabled.value) {
    return
  }
  previousEntryMethod.value = entryMethod
  commit({ ...environment.value, entryMethod })
}

function handleSupplementalLightChange(event) {
  if (props.disabled) {
    return
  }
  commit({
    ...environment.value,
    hasSupplementalLight: event?.detail?.value === true
  })
}

function entryMethodClass(entryMethod) {
  if (entryMethodDisabled.value) {
    return 'border border-[#d1dbd4] bg-[#f5f7f6] text-[#8f9991]'
  }
  if (hasSelectedLightType.value && environment.value.entryMethod === entryMethod) {
    return 'border-2 border-[#2d7a4f] bg-[#fbfdfc] text-[#1f2e24]'
  }
  return 'border border-[#d6e0d9] bg-white text-[#1f2e24]'
}

function confirmCurrentEnvironment() {
  if (props.disabled || !hasSelectedLightType.value) {
    return
  }
  const confirmedValue = markLightEnvironmentAsUser(environment.value)
  environment.value = confirmedValue
  emit('change', confirmedValue)
  emit('confirm', confirmedValue)
}
</script>

<style scoped>
/* #ifdef MP-TOUTIAO */
.light-environment-picker-illustration {
  height: 100%;
}
/* #endif */
</style>
