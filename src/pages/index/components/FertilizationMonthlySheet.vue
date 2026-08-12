<template>
  <BottomSheet
    ref="popupRef"
    panel-id="plant-card-fertilization-sheet"
    content-id="plant-card-fertilization-sheet-content"
    close-id="plant-card-fertilization-close-button"
    title="施肥时间表"
    subtitle="按植物所属属级养护数据展示"
    height-mode="fullHeight"
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

    <FertilizationReminderSetup
      v-if="fertilizationMonthly.available && currentMonthOptions.length && !reminder && !preview"
      :options="currentMonthOptions"
      :selected-type="selectedType"
      :loading="loading"
      :can-preview="canPreview"
      @select-type="selectedType = $event"
      @preview="createPreview"
    />
    <view
      v-if="fertilizationMonthly.available && !currentMonthOptions.length && !reminder && !preview"
      id="fertilization-reminder-no-fixed-period"
      class="mt-4 rounded-[14px] bg-[#FFF7DF] p-3"
    >
      <text class="text-xs leading-5 text-[#8A5A00]">本月没有可用于设置提醒的固定施肥周期。</text>
    </view>

    <view
      v-if="preview"
      id="fertilization-reminder-preview"
      class="mt-4 rounded-[14px] border border-[#D7E6DC] bg-[#F8FAF9] p-3"
    >
      <view class="flex items-start justify-between gap-2">
        <text class="min-w-0 flex-1 text-sm font-semibold text-[#1F2933]">
          {{ preview?.reminderKind === 'first_confirmation' ? '首次确认提醒' : '下次施肥提醒' }}：{{
            previewDateText
          }}
        </text>
        <button
          id="fertilization-reminder-calculation-info-button"
          class="m-0 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#7A9583] bg-white p-0 text-sm font-semibold leading-none text-[#52705E] after:border-0"
          hover-class="none"
          aria-label="查看提醒日期计算说明"
          @click.stop="showCalculationTooltipForTenSeconds"
        >
          <text class="leading-none">!</text>
        </button>
      </view>
      <text v-if="syncError" class="mt-2 block text-xs leading-5 text-[#B45309]">{{
        syncError
      }}</text>
      <button
        id="fertilization-reminder-calendar-confirm-button"
        class="mt-3 m-0 w-full rounded-xl bg-[#2D7A4F] py-3 text-sm font-semibold text-white after:border-0 disabled:bg-gray-300"
        hover-class="none"
        :disabled="loading || syncTerminalError"
        @click="confirmPreview"
      >
        {{
          loading
            ? '保存中…'
            : syncTerminalError
              ? '请先取消这次设置'
              : pendingCalendarPayload
                ? '重试同步'
                : preview.dueNow
                  ? '确认保存施肥提醒'
                  : '确认并添加到手机日历'
        }}
      </button>
      <button
        id="fertilization-reminder-cancel-button"
        class="mt-2 m-0 w-full rounded-xl border border-[#E1E9DD] bg-white py-2.5 text-xs text-[#53645A] after:border-0"
        hover-class="none"
        @click="cancelPreview"
      >
        取消这次设置
      </button>
    </view>

    <FertilizationReminderCalculationTooltip
      v-if="showCalculationTooltip && preview"
      :guidance="calculationGuidance"
      @close="hideCalculationTooltip"
    />

    <SavedFertilizationReminderState
      v-if="reminder"
      :reminder="reminder"
      :can-complete="canComplete"
      :current-month-evaluation="currentMonthEvaluation"
      :requires-extra-confirmation="Boolean(reminder?.requiresExtraConfirmation)"
      :confirmation-reasons="reminder?.confirmationReasons || []"
      @complete="completeReminder"
      @dismiss="dismissReminder"
      @reconfigure="showReconfigureAck = true"
    />

    <view
      v-if="showReconfigureAck"
      id="fertilization-reminder-reconfigure"
      class="mt-3 rounded-[14px] bg-[#FFF7DF] p-3"
    >
      <text class="block text-xs leading-5 text-[#8A5A00]">
        应用无法替你删除手机日历中的旧事件。请先在手机日历删除旧提醒，再继续重新设置。
      </text>
      <checkbox-group
        id="fertilization-reminder-reconfigure-ack-group"
        class="mt-2"
        @change="onReconfigureAcknowledgedChange"
      >
        <label class="flex items-center gap-2">
          <checkbox
            id="fertilization-reminder-reconfigure-ack"
            value="deleted"
            :checked="reconfigureAcknowledged"
            color="#2D7A4F"
          />
          <text class="text-xs text-[#53645A]">我已删除旧提醒</text>
        </label>
      </checkbox-group>
      <button
        id="fertilization-reminder-reconfigure-confirm"
        class="mt-2 m-0 w-full rounded-xl bg-[#2D7A4F] py-2.5 text-xs font-semibold text-white after:border-0 disabled:bg-gray-300"
        hover-class="none"
        :disabled="!reconfigureAcknowledged || loading"
        @click="confirmReconfigure"
      >
        开始重新设置
      </button>
      <button
        id="fertilization-reminder-reconfigure-cancel"
        class="mt-2 m-0 w-full rounded-xl border border-[#E1E9DD] bg-white py-2.5 text-xs text-[#53645A] after:border-0"
        hover-class="none"
        @click="showReconfigureAck = false"
      >
        暂不重设
      </button>
    </view>
  </BottomSheet>
</template>

<script setup>
import { computed, ref } from 'vue'
import BottomSheet from '@/components/common/BottomSheet.vue'
import FertilizationMonthlyTable from '@/components/FertilizationMonthlyTable.vue'
import {
  cancelFertilizationReminder,
  completeFertilizationReminder,
  confirmFertilizationReminder,
  dismissFertilizationReminder,
  fetchFertilizationReminder,
  previewFertilizationReminder
} from '@/api/plants-http.js'
import { callComponentMethod } from '@/utils/component-ref.js'
import FertilizationReminderCalculationTooltip from './FertilizationReminderCalculationTooltip.vue'
import FertilizationReminderSetup from './FertilizationReminderSetup.vue'
import SavedFertilizationReminderState from './SavedFertilizationReminderState.vue'
import { useFertilizationCalculationTooltip } from './useFertilizationCalculationTooltip.js'
import {
  addPhoneCalendar,
  buildFertilizationCalendarPayload,
  formatFertilizationCalculationGuidance,
  formatFertilizationCheckDate,
  resolveCurrentMonthEvaluation,
  resolveCurrentMonthOptions
} from './fertilization-reminder-options.js'

const FIRST_FREQUENCY_INDEX = 0
const SECOND_FREQUENCY_INDEX = 1

const props = defineProps({ plant: { type: Object, default: null } })
const emit = defineEmits(['close', 'changed'])
const popupRef = ref(null)
const reminder = ref(null)
const preview = ref(null)
const loading = ref(false)
const selectedType = ref('')
const pendingCalendarPayload = ref(null)
const syncError = ref('')
const syncTerminalError = ref(false)
const showReconfigureAck = ref(false)
const reconfigureAcknowledged = ref(false)
const {
  showCalculationTooltip,
  hideCalculationTooltip,
  showCalculationTooltipForTenSeconds
} = useFertilizationCalculationTooltip()

function onReconfigureAcknowledgedChange(event) {
  reconfigureAcknowledged.value = Boolean(event?.detail?.value?.includes('deleted'))
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
const currentMonthOptions = computed(() => resolveCurrentMonthOptions(fertilizationMonthly.value))
const currentMonthEvaluation = computed(() =>
  resolveCurrentMonthEvaluation(fertilizationMonthly.value, reminder.value?.fertilizerType)
)
const canPreview = computed(
  () =>
    Boolean(selectedType.value) &&
    currentMonthOptions.value.some(option => option.type === selectedType.value)
)
const canComplete = computed(() =>
  Boolean(
    reminder.value?.isDue &&
    ['interval', 'conditional', 'event'].includes(currentMonthEvaluation.value.kind)
  )
)
const previewDateText = computed(() => formatFertilizationCheckDate(preview.value?.nextCheckDate))
const calculationGuidance = computed(() =>
  formatFertilizationCalculationGuidance(preview.value)
)

function resetSetup() {
  reminder.value = null
  preview.value = null
  selectedType.value = currentMonthOptions.value[0]?.type || ''
  pendingCalendarPayload.value = null
  syncError.value = ''
  syncTerminalError.value = false
  hideCalculationTooltip()
  showReconfigureAck.value = false
  reconfigureAcknowledged.value = false
}

async function loadReminder() {
  const plantId = Number(props.plant?.id)
  if (!plantId) {
    resetSetup()
    return
  }
  try {
    const response = await fetchFertilizationReminder(plantId)
    reminder.value = response?.code === 200 ? response.data : null
    preview.value = null
    if (!reminder.value) {
      selectedType.value = currentMonthOptions.value[0]?.type || ''
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
    hideCalculationTooltip()
    emit('close')
  }
}

async function createPreview() {
  if (!canPreview.value || !props.plant?.id) {
    return
  }
  loading.value = true
  syncError.value = ''
  pendingCalendarPayload.value = null
  syncTerminalError.value = false
  hideCalculationTooltip()
  try {
    const response = await previewFertilizationReminder({
      plantId: Number(props.plant.id),
      fertilizerType: selectedType.value
    })
    if (response?.code !== 200 || !response.data) {
      throw new Error(response?.message || '暂时无法生成提醒日期')
    }
    preview.value = response.data
    showCalculationTooltipForTenSeconds()
  } catch (error) {
    uni.showToast({ title: error?.message || '生成失败', icon: 'none' })
  } finally {
    loading.value = false
  }
}

async function confirmPreview() {
  if (!preview.value || loading.value) {
    return
  }
  hideCalculationTooltip()
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

async function completeReminder(extraConfirmation = false) {
  if (!reminder.value || loading.value) {
    return
  }
  loading.value = true
  try {
    const response = await completeFertilizationReminder({
      plantId: Number(props.plant.id),
      planId: reminder.value.planId,
      extraConfirmation
    })
    if (response?.code !== 200) {
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
    reminder.value = null
    emit('changed', null)
  } catch (error) {
    uni.showToast({ title: error?.message || '结束失败', icon: 'none' })
  } finally {
    loading.value = false
  }
}

async function confirmReconfigure() {
  if (!reconfigureAcknowledged.value || !reminder.value) {
    return
  }
  loading.value = true
  try {
    const response = await dismissFertilizationReminder({
      plantId: Number(props.plant.id),
      planId: reminder.value.planId,
      reason: 'reconfigure'
    })
    if (response?.code !== 200) {
      throw new Error(response?.message || '无法结束旧提醒')
    }
    reminder.value = null
    showReconfigureAck.value = false
    reconfigureAcknowledged.value = false
    selectedType.value = currentMonthOptions.value[0]?.type || ''
    emit('changed', null)
  } catch (error) {
    uni.showToast({ title: error?.message || '无法重新设置', icon: 'none' })
  } finally {
    loading.value = false
  }
}

defineExpose({ open, close })
</script>
