<template>
  <BottomSheet
    ref="popupRef"
    panel-id="plant-card-fertilization-sheet"
    content-id="plant-card-fertilization-sheet-content"
    close-id="plant-card-fertilization-close-button"
    title="施肥时间表"
    subtitle="按植物所属属级养护数据展示"
    height-mode="fullHeight"
    confirm-id="fertilization-reminder-entry-button"
    confirm-text="设置下次施肥提醒"
    :show-confirm="canOpenReminderSetup"
    :confirm-disabled="loading"
    :on-confirm="openReminderSetup"
    :mask-click="!loading"
    @change="onPopupChange"
  >
    <view id="plant-card-fertilization-summary" class="mb-3 rounded-[14px] bg-[#F8F6F0] p-3">
      <text class="block text-sm font-semibold text-gray-800">
        {{ plant?.displayName || '当前植物' }}
      </text>
      <text v-if="plant?.genus" class="mt-1 block text-xs text-gray-500">
        {{ plant.genus }} 属
      </text>
      <text v-if="fertilizationText" class="mt-2 block text-xs leading-5 text-gray-600">
        基础施肥建议：{{ fertilizationText }}
      </text>
    </view>

    <FertilizationMonthlyTable
      v-if="fertilizationMonthly.available"
      :monthly="fertilizationMonthly"
      table-id="plant-card-fertilization-monthly-table"
    />
    <view
      v-else
      id="plant-card-fertilization-monthly-unavailable"
      class="rounded-[14px] bg-[#F8F6F0] p-3"
    >
      <text class="text-xs leading-5 text-gray-500">该植物属暂无已审核的月度施肥表</text>
      <text v-if="fertilizationText" class="mt-2 block text-xs leading-5 text-gray-600">
        {{ fertilizationText }}
      </text>
    </view>

    <view
      v-if="
        fertilizationMonthly.available &&
        !currentMonthOptions.length &&
        !currentMonthGuard &&
        !reminder &&
        !preview
      "
      id="fertilization-reminder-no-fixed-period"
      class="mt-4 rounded-[14px] bg-[#FFF7DF] p-3"
    >
      <text class="text-xs leading-5 text-[#8A5A00]">本月没有可用于设置提醒的固定施肥周期。</text>
    </view>
    <view
      v-if="currentMonthGuard && !reminder && !preview"
      id="fertilization-reminder-deferred"
      class="mt-4 rounded-[14px] bg-[#FFF7DF] p-3"
    >
      <text class="text-xs leading-5 text-[#8A5A00]">当前处于暂缓施肥状态，暂不能设置提醒。</text>
    </view>

    <FertilizationReminderPreview
      :preview="preview"
      :preview-date-text="previewDateText"
      :loading="loading"
      :sync-error="syncError"
      :sync-terminal-error="syncTerminalError"
      :pending-calendar-payload="pendingCalendarPayload"
      :asserted-date="assertedDate"
      :today-date="todayStr()"
      @alert="showFertilizationAlert"
      @confirm="confirmPreview"
      @cancel="cancelPreview"
      @asserted-date-change="onAssertedDateChange"
      @recalculate-with-asserted-date="recalculateWithAssertedDate"
    />

    <FertilizationReminderAlert
      :visible="showFertilizationAlertDialog"
      :content="fertilizationAlertContent"
      :title="fertilizationAlertTitle"
      :cancel-text="fertilizationAlertCancelText"
      :confirm-text="fertilizationAlertConfirmText"
      @confirm="confirmFertilizationAlert"
      @cancel="cancelFertilizationAlert"
    />

    <SavedFertilizationReminderState
      v-if="reminder"
      :reminder="reminder"
      :loading="loading"
      :can-complete="canComplete"
      :current-month-evaluation="currentMonthEvaluation"
      :condition-requirements="reminder?.conditionRequirements || []"
      :completion-block-reason="reminder?.completionBlockReason || ''"
      :calendar-delete-visible="showCalendarDelete"
      :requires-minimum-interval-acknowledgement="
        Boolean(reminder?.requiresMinimumIntervalAcknowledgement)
      "
      @complete-reminder="completeReminder"
      @dismiss="dismissReminder"
      @request-calendar-delete="openCalendarDelete"
    />

    <FertilizationReminderCalendarDelete
      :visible="showCalendarDelete"
      :acknowledged="calendarDeleteAcknowledged"
      :loading="loading"
      @change="onCalendarDeleteAcknowledgedChange"
      @confirm="confirmCalendarDelete"
      @cancel="closeCalendarDelete"
    />
  </BottomSheet>

  <BottomSheet
    ref="reminderSetupPopupRef"
    panel-id="fertilization-reminder-setup-sheet"
    content-id="fertilization-reminder-setup-sheet-content"
    close-id="fertilization-reminder-setup-close-button"
    title="选择肥料"
    :mask-click="!loading"
    @change="onReminderSetupPopupChange"
  >
    <FertilizationReminderSetup
      :options="currentMonthOptions"
      :selected-type="selectedType"
      :loading="loading"
      :can-preview="canSubmitPreview"
      :preflight="preflight"
      :sync-error="syncError"
      :condition-answers="conditionAnswers"
      :fertilizer-type-change-acknowledged="fertilizerTypeChangeAcknowledged"
      preview-button-text="继续"
      @select-type="selectFertilizerType"
      @change-condition="handleConditionChange"
      @change-type-change="onFertilizerTypeChange"
      @preview="handlePreviewRequest"
    />
  </BottomSheet>
</template>

<script setup>
import { computed, nextTick, ref } from 'vue'
import BottomSheet from '@/components/common/BottomSheet.vue'
import FertilizationMonthlyTable from '@/components/FertilizationMonthlyTable.vue'
import {
  cancelFertilizationReminder,
  completeFertilizationReminder,
  confirmFertilizationReminder,
  dismissFertilizationReminder,
  fetchFertilizationReminder,
  fetchFertilizationReminderFreshState,
  previewFertilizationReminder
} from '@/api/plants-http.js'
import { callComponentMethod } from '@/utils/component-ref.js'
import FertilizationReminderSetup from './FertilizationReminderSetup.vue'
import SavedFertilizationReminderState from './SavedFertilizationReminderState.vue'
import FertilizationReminderPreview from './FertilizationReminderPreview.vue'
import FertilizationReminderCalendarDelete from './FertilizationReminderCalendarDelete.vue'
import FertilizationReminderAlert from './FertilizationReminderAlert.vue'
import {
  addPhoneCalendar,
  buildFertilizationCalendarPayload,
  formatFertilizationAlertContent,
  formatFertilizationCheckDate,
  resolveCurrentMonthEvaluation,
  resolveCurrentMonthOptions,
  todayStr
} from './fertilization-reminder-options.js'

const FIRST_FREQUENCY_INDEX = 0
const SECOND_FREQUENCY_INDEX = 1

const props = defineProps({ plant: { type: Object, default: null } })
const emit = defineEmits(['close', 'changed'])
const popupRef = ref(null)
const reminderSetupPopupRef = ref(null)
const reminder = ref(null)
const preview = ref(null)
const loading = ref(false)
const selectedType = ref('')
const preflight = ref(null)
const conditionAnswers = ref({})
const fertilizerTypeChangeAcknowledged = ref(false)
const showFertilizationAlertDialog = ref(false)
const fertilizationAlertResolver = ref(null)
const fertilizationAlertMode = ref('preview')
const conditionOverrideCode = ref('')
const pendingCalendarPayload = ref(null)
const syncError = ref('')
const syncTerminalError = ref(false)
const showCalendarDelete = ref(false)
const calendarDeleteAcknowledged = ref(false)
const serverCurrentMonthOptions = ref(null)
const currentMonthGuard = ref(null)
const assertedDate = ref('')

const canOpenReminderSetup = computed(
  () =>
    fertilizationMonthly.value.available &&
    currentMonthOptions.value.length > 0 &&
    !currentMonthGuard.value &&
    !reminder.value &&
    !preview.value
)

function onCalendarDeleteAcknowledgedChange(event) {
  calendarDeleteAcknowledged.value = Boolean(event?.detail?.value?.includes('deleted'))
}

function openCalendarDelete() {
  calendarDeleteAcknowledged.value = false
  showCalendarDelete.value = true
}

function closeCalendarDelete() {
  showCalendarDelete.value = false
  calendarDeleteAcknowledged.value = false
}
const fertilizationMonthly = computed(
  () =>
    props.plant?.fertilizationMonthly || {
      available: false,
      rows: [],
      scopeLabel: '',
      scopeGuidance: '',
      choiceGuidance: '',
      publicNote: '',
      sourceNames: []
    }
)
const fertilizationText = computed(() => {
  const fertilization = props.plant?.fertilization
  if (!fertilization) {
    return ''
  }
  const freqText =
    Array.isArray(fertilization.freq) && fertilization.freq.length
      ? `${fertilization.freq[FIRST_FREQUENCY_INDEX]}${fertilization.freq[SECOND_FREQUENCY_INDEX] ? `-${fertilization.freq[SECOND_FREQUENCY_INDEX]}` : ''}${fertilization.unit || '天'}`
      : ''
  return [fertilization.type, freqText, fertilization.other].filter(Boolean).join(' · ')
})
const currentMonthOptions = computed(() =>
  Array.isArray(serverCurrentMonthOptions.value)
    ? serverCurrentMonthOptions.value
    : resolveCurrentMonthOptions(fertilizationMonthly.value)
)

function resolveLocalConditionPreflight(type = selectedType.value) {
  const option = currentMonthOptions.value.find(item => item.type === type)
  const conditionRequirements = Array.isArray(option?.conditionRequirements)
    ? option.conditionRequirements
    : []
  return conditionRequirements.length ? { conditionRequirements } : null
}

const currentMonthEvaluation = computed(() =>
  resolveCurrentMonthEvaluation(fertilizationMonthly.value, reminder.value?.fertilizerType)
)
const canPreview = computed(
  () =>
    Boolean(selectedType.value) &&
    !currentMonthGuard.value &&
    currentMonthOptions.value.some(option => option.type === selectedType.value)
)
const canSubmitPreview = computed(() => {
  if (!canPreview.value) {
    return false
  }
  if (!preflight.value) {
    return true
  }
  const conditionsReady = (preflight.value.conditionRequirements || [])
    .filter(requirement => !isGrowthCondition(requirement.code))
    .every(requirement => typeof conditionAnswers.value[requirement.code] === 'boolean')
  return (
    conditionsReady &&
    (!preflight.value.requiresFertilizerTypeChangeAcknowledgement ||
      fertilizerTypeChangeAcknowledged.value)
  )
})
const canComplete = computed(() =>
  Boolean(reminder.value?.isDue && reminder.value?.canComplete === true)
)
const previewDateText = computed(() => formatFertilizationCheckDate(preview.value?.nextCheckDate))

function resetSetup() {
  reminder.value = null
  preview.value = null
  preflight.value = null
  conditionAnswers.value = {}
  fertilizerTypeChangeAcknowledged.value = false
  pendingCalendarPayload.value = null
  syncError.value = ''
  syncTerminalError.value = false
  showCalendarDelete.value = false
  calendarDeleteAcknowledged.value = false
  serverCurrentMonthOptions.value = null
  currentMonthGuard.value = null
  assertedDate.value = ''
  selectedType.value = currentMonthOptions.value[0]?.type || ''
  preflight.value = resolveLocalConditionPreflight()
}

async function loadReminder() {
  const plantId = Number(props.plant?.id)
  if (!plantId) {
    resetSetup()
    return
  }
  try {
    const response = await fetchFertilizationReminder(plantId)
    const responseData = response?.code === 200 ? response.data : null
    reminder.value = responseData?.active === true ? responseData : null
    serverCurrentMonthOptions.value = Array.isArray(responseData?.currentMonthOptions)
      ? responseData.currentMonthOptions
      : null
    currentMonthGuard.value = responseData?.fertilizationGuard || null
    preview.value = null
    preflight.value = null
    conditionAnswers.value = {}
    fertilizerTypeChangeAcknowledged.value = false
    if (!reminder.value) {
      selectedType.value = currentMonthOptions.value[0]?.type || ''
      preflight.value = resolveLocalConditionPreflight()
    }
  } catch (error) {
    console.warn('读取施肥提醒失败:', error?.message || error)
    resetSetup()
  }
}

async function open() {
  callComponentMethod(popupRef, 'open')
  await loadReminder()
}

function close() {
  callComponentMethod(popupRef, 'close')
}

function onPopupChange(event) {
  if (!event?.show) {
    closeReminderSetup()
    emit('close')
  }
}

function onReminderSetupPopupChange(event) {
  if (!event?.show) {
    syncError.value = ''
  }
}

function openReminderSetup() {
  if (!canOpenReminderSetup.value) {
    return
  }
  syncError.value = ''
  callComponentMethod(reminderSetupPopupRef, 'open')
}

function closeReminderSetup() {
  callComponentMethod(reminderSetupPopupRef, 'close')
}

function showFertilizationAlert() {
  if (!preview.value) {
    return Promise.resolve(false)
  }
  fertilizationAlertMode.value = 'preview'
  showFertilizationAlertDialog.value = true
  return new Promise(resolve => {
    fertilizationAlertResolver.value = resolve
  })
}

function showGrowthConditionAlert(code) {
  closeReminderSetup()
  conditionOverrideCode.value = String(code || '').trim()
  fertilizationAlertMode.value = 'growth_condition'
  showFertilizationAlertDialog.value = true
}

const fertilizationAlertContent = computed(() => {
  if (fertilizationAlertMode.value === 'growth_condition') {
    return '本月按表默认不安排施肥。\n只有植物近期确实长出新叶或新芽，才建议继续设置提醒。'
  }
  return formatFertilizationAlertContent(preview.value)
})
const fertilizationAlertTitle = computed(() =>
  fertilizationAlertMode.value === 'growth_condition' ? '请确认施肥条件' : '施肥提醒'
)
const fertilizationAlertCancelText = computed(() =>
  fertilizationAlertMode.value === 'growth_condition' ? '本次不设置' : '稍后设置'
)
const fertilizationAlertConfirmText = computed(() =>
  fertilizationAlertMode.value === 'growth_condition' ? '继续设置' : '设置日历'
)

async function confirmFertilizationAlert() {
  const alertMode = fertilizationAlertMode.value
  const growthCode = conditionOverrideCode.value
  showFertilizationAlertDialog.value = false
  if (alertMode === 'growth_condition') {
    conditionOverrideCode.value = ''
    if (growthCode) {
      setConditionAnswer({ code: growthCode, value: true })
    }
    fertilizationAlertMode.value = 'preview'
    await createPreview()
    return
  } else {
    await confirmPreview()
  }
  fertilizationAlertResolver.value?.(true)
  fertilizationAlertResolver.value = null
}

function cancelFertilizationAlert() {
  showFertilizationAlertDialog.value = false
  conditionOverrideCode.value = ''
  fertilizationAlertResolver.value?.(false)
  fertilizationAlertResolver.value = null
}

function onAssertedDateChange(event) {
  assertedDate.value = String(event?.detail?.value || '').trim()
}

function resolveFertilizationErrorMessage(error, fallback = '暂时无法生成提醒日期') {
  const candidates = [
    error?.message,
    error?.data?.message,
    error?.response?.data?.message,
    error?.response?.message
  ]
  const message = candidates.find(value => typeof value === 'string' && value.trim())
  return message ? message.trim() : fallback
}

async function createPreview(userAssertedLastAppliedDate = '') {
  if (!canPreview.value || !props.plant?.id) {
    return
  }
  loading.value = true
  syncError.value = ''
  pendingCalendarPayload.value = null
  syncTerminalError.value = false
  let shouldShowAlert = false
  try {
    const response = await previewFertilizationReminder({
      plantId: Number(props.plant.id),
      fertilizerType: selectedType.value,
      conditionAnswers: conditionAnswers.value,
      acknowledgeFertilizerTypeChange: fertilizerTypeChangeAcknowledged.value,
      ...(userAssertedLastAppliedDate ? { userAssertedLastAppliedDate } : {})
    })
    if (Number(response?.code) !== 200 || !response.data) {
      const responseData = response?.data || {}
      if (
        responseData.conditionRequirements?.length ||
        responseData.requiresFertilizerTypeChangeAcknowledgement
      ) {
        preflight.value = responseData
        syncError.value = resolveFertilizationErrorMessage(response, '请先确认设置条件')
        return
      }
      syncError.value = resolveFertilizationErrorMessage(response)
      return
    }
    preview.value = response.data
    preflight.value = null
    conditionAnswers.value = {}
    fertilizerTypeChangeAcknowledged.value = false
    shouldShowAlert = true
  } catch (error) {
    syncError.value = resolveFertilizationErrorMessage(error, '生成失败，请稍后重试')
    uni.showToast({ title: syncError.value, icon: 'none' })
  } finally {
    loading.value = false
    if (shouldShowAlert) {
      closeReminderSetup()
      await nextTick()
      await showFertilizationAlert()
    }
  }
}

async function handlePreviewRequest() {
  const growthRequirement = (preflight.value?.conditionRequirements || []).find(requirement =>
    isGrowthCondition(requirement.code)
  )
  if (growthRequirement && conditionAnswers.value[growthRequirement.code] !== true) {
    await showGrowthConditionAlert(growthRequirement.code)
    return
  }
  await createPreview()
}

async function recalculateWithAssertedDate(date) {
  const normalizedDate = String(date || '').trim()
  if (!normalizedDate || loading.value || !preview.value) {
    return
  }
  loading.value = true
  try {
    if (preview.value.planId) {
      await cancelFertilizationReminder({ planId: preview.value.planId }).catch(() => {})
    }
    preview.value = null
    pendingCalendarPayload.value = null
    await createPreview(normalizedDate)
  } finally {
    loading.value = false
  }
}

async function confirmPreview() {
  if (!preview.value || loading.value) {
    return
  }
  loading.value = true
  syncError.value = ''
  syncTerminalError.value = false
  let confirmResponseCode = 0
  try {
    let calendarPayload = pendingCalendarPayload.value
    if (!preview.value.dueNow && !calendarPayload) {
      calendarPayload = buildFertilizationCalendarPayload({
        plant: props.plant,
        nextCheckDate: preview.value.nextCheckDate,
        ruleSnapshot: preview.value.ruleSnapshot,
        reminderKind: preview.value.reminderKind
      })
      await addPhoneCalendar(calendarPayload)
      pendingCalendarPayload.value = calendarPayload
    }
    const response = await confirmFertilizationReminder({
      plantId: Number(props.plant.id),
      planId: preview.value.planId,
      calendarPayload
    })
    confirmResponseCode = Number(response?.code || 0)
    if (response?.code !== 200 || !response.data) {
      throw new Error(response?.message || '应用内同步失败')
    }
    reminder.value = response.data
    try {
      const refreshedResponse = await fetchFertilizationReminderFreshState(Number(props.plant.id))
      if (refreshedResponse?.code === 200 && refreshedResponse.data?.active === true) {
        reminder.value = refreshedResponse.data
      } else {
        throw new Error('提醒已保存，但最新状态暂时无法读取')
      }
    } catch (refreshError) {
      syncError.value = refreshError?.message || '提醒已保存，请重新打开查看最新状态。'
    }
    preview.value = null
    pendingCalendarPayload.value = null
    emit('changed', reminder.value)
  } catch (error) {
    if (pendingCalendarPayload.value && confirmResponseCode === 409) {
      syncTerminalError.value = true
      syncError.value =
        '这次应用内计划已失效。若手机日历已经新增事件，请先删除该事件，再取消这次设置并重新生成。'
      return
    }
    syncError.value = pendingCalendarPayload.value
      ? '手机日历已添加，但应用内还没保存成功，请点击“重试同步”。'
      : error?.message || '暂时无法添加提醒，请稍后重试。'
    if (!pendingCalendarPayload.value && preview.value?.planId) {
      await cancelFertilizationReminder({ planId: preview.value.planId }).catch(() => {})
      preview.value = null
      uni.showToast({ title: syncError.value, icon: 'none' })
    }
  } finally {
    loading.value = false
  }
}

async function cancelPreview() {
  if (preview.value?.planId) {
    await cancelFertilizationReminder({ planId: preview.value.planId }).catch(() => {})
  }
  preview.value = null
  pendingCalendarPayload.value = null
  syncError.value = ''
  syncTerminalError.value = false
}

function selectFertilizerType(type) {
  selectedType.value = type
  preflight.value = resolveLocalConditionPreflight(type)
  conditionAnswers.value = {}
  fertilizerTypeChangeAcknowledged.value = false
  syncError.value = ''
}

function setConditionAnswer({ code, value } = {}) {
  if (!code || typeof value !== 'boolean') {
    return
  }
  conditionAnswers.value = { ...conditionAnswers.value, [code]: value }
  syncError.value = ''
}

async function handleConditionChange({ code, value } = {}) {
  if (!code || typeof value !== 'boolean') {
    return
  }
  if (value === true && isGrowthCondition(code)) {
    await showGrowthConditionAlert(code)
    return
  }
  setConditionAnswer({ code, value })
}

function isGrowthCondition(code) {
  return ['active_growth', 'new_leaves_or_shoots'].includes(String(code || '').trim())
}

function onFertilizerTypeChange(event) {
  fertilizerTypeChangeAcknowledged.value = Boolean(event?.detail?.value?.includes('confirmed'))
}

async function completeReminder(completion = {}) {
  if (!reminder.value || loading.value) {
    return
  }
  loading.value = true
  try {
    const response = await completeFertilizationReminder({
      plantId: Number(props.plant.id),
      planId: reminder.value.planId,
      conditionAnswers: completion.conditionAnswers || {},
      acknowledgeMinimumInterval: completion.acknowledgeMinimumInterval === true,
      acknowledgeFertilizerTypeChange: completion.acknowledgeFertilizerTypeChange === true
    })
    if (response?.code !== 200) {
      if (response?.data && reminder.value) {
        reminder.value = { ...reminder.value, ...response.data }
      }
      throw new Error(response?.message || '记录失败')
    }
    reminder.value = null
    preview.value = response.data?.nextPreview || null
    pendingCalendarPayload.value = null
    syncError.value = ''
    syncTerminalError.value = false
    emit('changed', null)
    if (!preview.value) {
      uni.showToast({ title: '已记录今天施肥', icon: 'success' })
    }
  } catch (error) {
    uni.showToast({ title: error?.message || '记录失败', icon: 'none' })
  } finally {
    loading.value = false
  }
}

async function dismissReminder() {
  if (!reminder.value || loading.value) {
    return
  }
  loading.value = true
  try {
    const response = await dismissFertilizationReminder({
      plantId: Number(props.plant.id),
      planId: reminder.value.planId
    })
    if (response?.code !== 200) {
      throw new Error(response?.message || '结束失败')
    }
    await loadReminder()
    emit('changed', null)
  } catch (error) {
    uni.showToast({ title: error?.message || '结束失败', icon: 'none' })
  } finally {
    loading.value = false
  }
}

async function confirmCalendarDelete() {
  if (!calendarDeleteAcknowledged.value || !reminder.value || loading.value) {
    return false
  }
  loading.value = true
  try {
    const response = await cancelFertilizationReminder({
      plantId: Number(props.plant.id),
      planId: reminder.value.planId,
      reason: 'calendar_deleted'
    })
    if (response?.code !== 200) {
      throw new Error(response?.message || '删除失败')
    }
    await loadReminder()
    emit('changed', null)
    closeCalendarDelete()
    uni.showToast({ title: '施肥日历提醒已移除', icon: 'success' })
    return true
  } catch (error) {
    uni.showToast({ title: error?.message || '删除失败', icon: 'none' })
    return false
  } finally {
    loading.value = false
  }
}

defineExpose({ open, close })
</script>
