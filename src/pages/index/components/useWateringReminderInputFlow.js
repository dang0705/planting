import { computed, ref } from 'vue'
import { mergeEnvironmentWeatherWindowIntoCareBehaviorTimeline } from '@/utils/care-behavior-weather-window.js'
import { resolveComponentMethod } from '@/utils/component-ref.js'
import { buildWateringReminderInputSignature, todayStr } from './watering-reminder-options.js'

function normalizeDimension(value) {
  const dimension = Number(value)
  return Number.isFinite(dimension) && dimension > 0 ? dimension : null
}

function normalizeDrainage(value) {
  if (value === true || value === 'true') {
    return 'true'
  }
  if (value === false || value === 'false') {
    return 'false'
  }
  return 'unknown'
}

function resolveSubstrateMaterials(profile) {
  let composition = profile?.substrateComposition
  if (!Array.isArray(composition) && typeof profile?.substrateType === 'string') {
    try {
      composition = profile.substrateType.startsWith('[') ? JSON.parse(profile.substrateType) : []
    } catch {
      composition = []
    }
  }
  return (Array.isArray(composition) ? composition : [])
    .map(item => String(item?.material || item || '').trim())
    .filter(Boolean)
    .sort()
}

function hasPotProfileChanged(nextProfile, currentProfile) {
  if (!currentProfile) {
    return true
  }
  const next = {
    top: normalizeDimension(nextProfile?.potTopDiameterCm),
    bottom: normalizeDimension(nextProfile?.potBottomDiameterCm),
    height: normalizeDimension(nextProfile?.potHeightCm),
    drainage: normalizeDrainage(nextProfile?.hasDrainageHole),
    substrates: resolveSubstrateMaterials(nextProfile)
  }
  const current = {
    top: normalizeDimension(currentProfile?.potTopDiameterCm),
    bottom: normalizeDimension(currentProfile?.potBottomDiameterCm),
    height: normalizeDimension(currentProfile?.potHeightCm),
    drainage: normalizeDrainage(currentProfile?.hasDrainageHole),
    substrates: resolveSubstrateMaterials(currentProfile)
  }
  return JSON.stringify(next) !== JSON.stringify(current)
}

/**
 * 浇水提醒的输入步骤协调器。
 *
 * 只负责“过往浇水日期 → 盆型设置 → 重新计算建议”的暂存、校验和提交。
 * 日期是规划器的硬性输入；盆型仍是可选增强项，空盆型不会被示例值写入植物资料。
 */
export function useWateringReminderInputFlow({
  props,
  plantStore,
  selectedWateringEvents,
  wateringHistoryTouched,
  selectedWateringEventsForPlanner,
  pendingReminderSavePayload,
  calendarSyncError,
  environmentWeatherWindow,
  weatherLoading,
  plannerError,
  loadWeatherDays,
  fetchPlanner
}) {
  const inputStepperRef = ref(null)
  const inputFlowOpen = ref(false)
  const inputFlowStep = ref(0)
  const inputFlowLoading = ref(false)
  const inputFlowWateringEvents = ref([])
  const inputFlowHistorySignature = ref('')

  // 微信小程序运行时的组件 ref 可能是 Vue 实例、$vm 或 exposed 对象。
  // 统一从 ref 解析方法，避免开发端能取到 ref、端上却静默跳过保存。
  function resolveStepperMethod(methodName) {
    return resolveComponentMethod(inputStepperRef, methodName)
  }

  function invokeStepperMethod(methodName, ...args) {
    return resolveStepperMethod(methodName)?.(...args)
  }

  const timelineInput = computed(() => {
    const wateringEvents = inputFlowOpen.value
      ? inputFlowWateringEvents.value
      : selectedWateringEventsForPlanner.value
    const base = { reference_date: todayStr(), watering_events_10d: wateringEvents }
    return environmentWeatherWindow.value
      ? mergeEnvironmentWeatherWindowIntoCareBehaviorTimeline(base, environmentWeatherWindow.value)
      : base
  })
  const hasRequiredWateringHistory = computed(
    () => selectedWateringEventsForPlanner.value.length > 0
  )
  const inputFlowHasHistory = computed(() => inputFlowWateringEvents.value.length > 0)
  const inputFlowNextText = computed(() =>
    inputFlowStep.value === 0 ? '下一步：盆型设置' : '查看浇水建议'
  )

  function resetInputFlowState() {
    inputFlowWateringEvents.value = []
    inputFlowHistorySignature.value = ''
    inputFlowOpen.value = false
    inputFlowStep.value = 0
    inputFlowLoading.value = false
  }

  function openInputFlow(step = 0) {
    if (pendingReminderSavePayload.value) {
      calendarSyncError.value = '请先继续同步这条提醒，不要重复添加日历。'
      return
    }
    plannerError.value = ''
    inputFlowWateringEvents.value = [...selectedWateringEventsForPlanner.value]
    inputFlowHistorySignature.value = buildWateringReminderInputSignature({
      wateringEvents: inputFlowWateringEvents.value
    })
    inputFlowStep.value = hasRequiredWateringHistory.value ? step : 0
    inputFlowOpen.value = true
    if (!environmentWeatherWindow.value && !weatherLoading.value) {
      loadWeatherDays()
    }
  }

  function openLastWateringPicker() {
    openInputFlow(0)
  }

  function openPotProfileEditor() {
    openInputFlow(hasRequiredWateringHistory.value ? 1 : 0)
  }

  function onTimelineChange(payload) {
    const events = Array.isArray(payload?.watering_events_10d) ? payload.watering_events_10d : []
    const nextSignature = buildWateringReminderInputSignature({ wateringEvents: events })
    if (nextSignature === inputFlowHistorySignature.value) {
      return
    }
    inputFlowWateringEvents.value = events
    inputFlowHistorySignature.value = nextSignature
  }

  async function handleInputNext() {
    if (!inputStepperRef.value || inputFlowLoading.value) {
      return
    }
    if (inputFlowStep.value === 0) {
      invokeStepperMethod('next')
      return
    }

    const profileState = invokeStepperMethod('getPotProfileState')
    if (profileState === undefined) {
      plannerError.value = '盆型信息还未加载，请重试'
      return
    }
    if (profileState !== 'empty' && !invokeStepperMethod('validatePotProfile')) {
      return
    }
    const oversizedPotConfirmed = await invokeStepperMethod('confirmOversizedPot')
    if (oversizedPotConfirmed !== true) {
      return
    }

    inputFlowLoading.value = true
    try {
      const wateringEvents = invokeStepperMethod('getWateringEvents') || []
      if (!wateringEvents.length) {
        return
      }
      const payload = invokeStepperMethod('getPotProfilePayload')
      if (profileState !== 'empty' && hasPotProfileChanged(payload, props.plant?.potProfile)) {
        if (!payload) {
          throw new Error('盆型信息未读取，请返回重新拖动')
        }
        if (!props.plant?.id) {
          throw new Error('当前植物未加载，请关闭后重试')
        }
        const result = await plantStore.savePotProfile(props.plant.id, payload)
        if (!result?.success) {
          throw new Error(result?.message || '盆型信息暂未保存，请重试')
        }
        invokeStepperMethod('commitPotProfile')
      }
      selectedWateringEvents.value = [...wateringEvents]
      wateringHistoryTouched.value = true
      inputFlowOpen.value = false
      await loadWeatherDays()
      await fetchPlanner()
    } catch (error) {
      plannerError.value = error?.message || '盆型信息暂未保存，请重试'
    } finally {
      inputFlowLoading.value = false
    }
  }

  function handleInputPrevious() {
    if (inputFlowLoading.value) {
      return
    }
    if (inputFlowStep.value === 0) {
      inputFlowOpen.value = false
      return
    }
    invokeStepperMethod('previous')
  }

  return {
    inputStepperRef,
    inputFlowOpen,
    inputFlowStep,
    inputFlowLoading,
    inputFlowWateringEvents,
    timelineInput,
    hasRequiredWateringHistory,
    inputFlowHasHistory,
    inputFlowNextText,
    resetInputFlowState,
    openInputFlow,
    openLastWateringPicker,
    openPotProfileEditor,
    onTimelineChange,
    handleInputNext,
    handleInputPrevious
  }
}
