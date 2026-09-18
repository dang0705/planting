<template>
  <view
    :id="`${idPrefix}-plant-profile-completeness-${plantKey}`"
    class="flex size-5 flex-[0_0_20px] items-center justify-center rounded-full"
    title="点击查看信息完整度说明"
    @click.stop="openDetails"
  >
    <view
      class="flex size-5 flex-[0_0_20px] items-center justify-center rounded-full"
      :style="ringStyle"
    >
      <view class="size-[14px] rounded-full bg-white" />
    </view>
  </view>

  <uni-popup ref="popupRef" type="center" :is-mask-click="true">
    <view
      :id="`${idPrefix}-plant-profile-completeness-dialog-${plantKey}`"
      class="w-[calc(100vw-32px)] max-w-[362px] rounded-[24px] border border-[rgba(45,122,79,0.15)] bg-white p-4 shadow-[0_25px_25px_rgba(0,0,0,0.25)]"
    >
      <view>
        <text class="block text-base font-semibold leading-6 text-[#0a0a0a]"> 信息完整度说明 </text>
        <text class="mt-1 block text-xs leading-4 text-[#5a7a68]">
          完整度越高，诊断和养护会越准哦。
        </text>
      </view>

      <view class="mt-3">
        <view
          v-for="status in statusLegend"
          :key="status.key"
          class="mb-2 rounded-[16px] border px-3 py-3 last:mb-0"
          :style="
            status.key === scorePresentation.key
              ? {
                  backgroundColor: status.activeBackgroundColor,
                  borderColor: status.activeBorderColor,
                  borderWidth: '2px'
                }
              : {
                  backgroundColor: status.inactiveBackgroundColor,
                  borderColor: status.inactiveBorderColor,
                  borderWidth: '1px'
                }
          "
        >
          <view class="flex items-center gap-2">
            <view
              class="size-3 flex-[0_0_12px] rounded-full"
              :style="{ backgroundColor: status.color }"
            />
            <text
              class="text-sm font-semibold leading-5"
              :style="{
                color:
                  status.key === scorePresentation.key ? status.color : status.inactiveTextColor,
                fontWeight: status.key === scorePresentation.key ? '700' : '500'
              }"
            >
              {{ status.label }}
            </text>
          </view>
          <text
            class="mt-2 block pl-5 text-xs leading-5"
            :style="{
              color:
                status.key === scorePresentation.key
                  ? status.color
                  : status.inactiveDescriptionColor
            }"
          >
            {{ status.description }}
          </text>
          <button
            v-if="status.key === scorePresentation.key && status.requiresProfileCompletion"
            :id="`${idPrefix}-plant-profile-completeness-complete-${plantKey}`"
            class="m-0 ml-5 mt-2 box-border h-6 rounded-full px-3 py-1 text-xs font-semibold leading-4 text-white after:border-0"
            :style="{ backgroundColor: status.color }"
            hover-class="none"
            @click.stop="requestCompletion"
          >
            去完善
          </button>
        </view>
      </view>
    </view>
  </uni-popup>
</template>

<script setup>
import { computed, ref } from 'vue'
import { getPlantProfileCompletenessDetail } from '@/utils/plant-profile-completeness.js'
import { callComponentMethod } from '@/utils/component-ref.js'

const props = defineProps({
  plant: { type: Object, required: true },
  idPrefix: { type: String, default: 'index' }
})
const emit = defineEmits(['complete'])
const popupRef = ref(null)
const SCORE_MIN = 0
const SCORE_MAX = 100
const COMPLETE_SCORE_MIN = 90
const FAIRLY_COMPLETE_SCORE_MIN = 80
const INCOMPLETE_SCORE_MIN = 70
const FULL_CIRCLE_DEGREES = 360
const SCORE_TO_DEGREES = FULL_CIRCLE_DEGREES / SCORE_MAX

const statusLegend = Object.freeze([
  {
    key: 'complete',
    label: '完整',
    description: '很棒，资料很完整，能得到精准的诊断和养护策略。',
    color: '#2f6f4e',
    activeBackgroundColor: '#dcefe3',
    activeBorderColor: '#2f6f4e',
    requiresProfileCompletion: false,
    inactiveBackgroundColor: '#f3f5f4',
    inactiveBorderColor: '#cbd6ce',
    inactiveTextColor: '#66756d',
    inactiveDescriptionColor: '#7d8c84'
  },
  {
    key: 'fairly-complete',
    label: '较完整',
    description: '诊断可用，少量建议会按默认值估算。',
    color: '#6aad7e',
    activeBackgroundColor: '#e0f1e5',
    activeBorderColor: '#4f9463',
    requiresProfileCompletion: false,
    inactiveBackgroundColor: '#f3f5f4',
    inactiveBorderColor: '#cbd6ce',
    inactiveTextColor: '#66756d',
    inactiveDescriptionColor: '#7d8c84'
  },
  {
    key: 'incomplete',
    label: '不完整',
    description: '关键条件缺失，建议先补充资料，再继续获取更准确的诊断和养护建议。',
    color: '#d4a017',
    activeBackgroundColor: '#fff0c7',
    activeBorderColor: '#b58105',
    requiresProfileCompletion: true,
    inactiveBackgroundColor: '#f3f5f4',
    inactiveBorderColor: '#cbd6ce',
    inactiveTextColor: '#66756d',
    inactiveDescriptionColor: '#7d8c84'
  },
  {
    key: 'unqualified',
    label: '不合格',
    description: '建议先补充资料，否则暂不生成精细方案。',
    color: '#d94f4f',
    activeBackgroundColor: '#ffe0e0',
    activeBorderColor: '#d94f4f',
    requiresProfileCompletion: true,
    inactiveBackgroundColor: '#f3f5f4',
    inactiveBorderColor: '#cbd6ce',
    inactiveTextColor: '#66756d',
    inactiveDescriptionColor: '#7d8c84'
  }
])
const statusByKey = Object.freeze({
  complete: statusLegend.find(status => status.key === 'complete'),
  'fairly-complete': statusLegend.find(status => status.key === 'fairly-complete'),
  incomplete: statusLegend.find(status => status.key === 'incomplete'),
  unqualified: statusLegend.find(status => status.key === 'unqualified')
})

const idPrefix = computed(() => String(props.idPrefix || 'index').trim() || 'index')
const plantKey = computed(() => String(props.plant?.id ?? 'unknown'))
const detail = computed(() => getPlantProfileCompletenessDetail(props.plant))
const scorePresentation = computed(() => {
  const score = detail.value.score
  if (score >= COMPLETE_SCORE_MIN) {
    return statusByKey.complete
  }
  if (score >= FAIRLY_COMPLETE_SCORE_MIN) {
    return statusByKey['fairly-complete']
  }
  if (score >= INCOMPLETE_SCORE_MIN) {
    return statusByKey.incomplete
  }
  return statusByKey.unqualified
})
const ringStyle = computed(() => {
  const angle = Math.max(SCORE_MIN, Math.min(SCORE_MAX, detail.value.score)) * SCORE_TO_DEGREES
  return {
    background: `conic-gradient(${scorePresentation.value.color} ${angle}deg, #dbe7df 0)`
  }
})

function openDetails() {
  callComponentMethod(popupRef, 'open')
}

function requestCompletion() {
  callComponentMethod(popupRef, 'close')
  emit('complete')
}

defineExpose({ open: openDetails })
</script>
