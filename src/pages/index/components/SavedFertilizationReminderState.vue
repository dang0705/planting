<template>
  <view
    id="fertilization-reminder-saved-state"
    class="mt-4 rounded-[14px] border border-[#D7E6DC] bg-[#F8FAF9] p-3"
  >
    <text class="block text-sm font-semibold text-[#1F2933]">
      {{
        reminder?.reminderKind === 'first_confirmation' ? '首次确认提醒已设置' : '施肥提醒已设置'
      }}
    </text>
    <text
      id="fertilization-reminder-saved-next-time"
      class="mt-1 block text-xs leading-5 text-[#53645A]"
    >
      {{
        reminder?.isDue
          ? reminder?.reminderKind === 'first_confirmation'
            ? '首次确认提醒已到，请打开青花植查看本月规则。'
            : '施肥提醒已到，请打开青花植查看本月规则。'
          : `${reminder?.reminderKind === 'first_confirmation' ? '首次确认提醒' : '下次施肥提醒'}：${formatDate(reminder?.nextCheckDate)}`
      }}
    </text>
    <text class="mt-1 block text-[11px] leading-4 text-[#667085]">
      提醒会先显示当月规则，请按页面提示决定是否施肥。
    </text>
    <text
      v-if="currentMonthEvaluation"
      id="fertilization-reminder-current-month-rule"
      class="mt-2 block text-xs leading-5 text-[#374151]"
    >
      本月规则：{{ currentMonthEvaluation.cell?.displayText || '暂无可执行的施肥规则' }}
    </text>

    <view v-if="reminder?.isDue" class="mt-3 rounded-xl bg-white p-3">
      <text v-if="!canComplete" class="block text-xs leading-5 text-[#8A5A00]">
        {{ completionBlockMessage }}
      </text>

      <view
        v-if="canComplete && conditionRequirements.length"
        id="fertilization-reminder-condition-checks"
        class="rounded-xl bg-[#FFF7DF] p-2.5"
      >
        <text class="block text-[11px] leading-4 text-[#8A5A00]">请先确认当前情况：</text>
        <view v-for="requirement in conditionRequirements" :key="requirement.code" class="mt-2">
          <text class="block text-xs leading-5 text-[#53645A]">{{ requirement.prompt }}</text>
          <view class="mt-1.5 grid grid-cols-2 gap-2">
            <button
              :id="`fertilization-reminder-due-condition-${requirement.code}-yes`"
              class="m-0 rounded-lg border px-2 py-2 text-xs after:border-0"
              :class="
                conditionAnswers[requirement.code] === true
                  ? 'border-[#2D7A4F] bg-[#E8F5E9] text-[#2D7A4F]'
                  : 'border-[#E1E9DD] bg-white text-[#53645A]'
              "
              hover-class="none"
              @tap="setConditionAnswer(requirement.code, true)"
            >
              是
            </button>
            <button
              :id="`fertilization-reminder-due-condition-${requirement.code}-no`"
              class="m-0 rounded-lg border px-2 py-2 text-xs after:border-0"
              :class="
                conditionAnswers[requirement.code] === false
                  ? 'border-[#2D7A4F] bg-[#E8F5E9] text-[#2D7A4F]'
                  : 'border-[#E1E9DD] bg-white text-[#53645A]'
              "
              hover-class="none"
              @tap="setConditionAnswer(requirement.code, false)"
            >
              否
            </button>
          </view>
        </view>
      </view>

      <view
        v-if="canComplete && requiresMinimumIntervalAcknowledgement"
        id="fertilization-reminder-minimum-interval"
        class="mt-2 rounded-xl bg-[#FFF7DF] p-2.5"
      >
        <text class="block text-[11px] leading-4 text-[#8A5A00]"
          >这是首次确认提醒，系统没有可靠的上次施肥日期。</text
        >
        <checkbox-group
          id="fertilization-reminder-minimum-interval-group"
          class="mt-2"
          @change="onMinimumIntervalChange"
        >
          <label class="flex items-center gap-2">
            <checkbox
              id="fertilization-reminder-minimum-interval-ack"
              value="confirmed"
              :checked="minimumIntervalConfirmed"
              color="#2D7A4F"
            />
            <text class="text-xs text-[#53645A]">我确认距离上次施肥至少达到本表最短间隔</text>
          </label>
        </checkbox-group>
      </view>

      <view
        v-if="canComplete"
        id="fertilization-reminder-complete-button"
        class="mt-2 w-full rounded-xl py-2.5 text-center text-sm font-semibold text-white"
        :class="canSubmit ? 'bg-[#2D7A4F]' : 'bg-gray-300'"
        role="button"
        :aria-disabled="!canSubmit"
        @tap="handleCompleteClick"
      >
        今天已施肥
      </view>
      <view
        id="fertilization-reminder-dismiss-button"
        class="mt-2 m-0 w-full rounded-xl border border-[#E1E9DD] bg-white py-2.5 text-sm text-[#53645A] after:border-0"
        role="button"
        @tap.stop="handleDismissClick"
      >
        本次跳过
      </view>
    </view>

    <button
      v-if="!calendarDeleteVisible"
      id="fertilization-reminder-delete-calendar-button"
      class="mt-2 m-0 w-full rounded-xl border border-[#E1E9DD] bg-white py-2.5 text-xs text-[#53645A] after:border-0"
      hover-class="none"
      :disabled="loading"
      @tap="$emit('request-calendar-delete')"
    >
      删除日历施肥提醒
    </button>
  </view>
</template>

<script setup>
import { computed, ref, watch } from 'vue'

const emit = defineEmits(['completeReminder', 'dismiss', 'request-calendar-delete'])

const props = defineProps({
  reminder: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  canComplete: { type: Boolean, default: false },
  currentMonthEvaluation: { type: Object, default: null },
  conditionRequirements: { type: Array, default: () => [] },
  requiresMinimumIntervalAcknowledgement: { type: Boolean, default: false },
  completionBlockReason: { type: String, default: '' },
  calendarDeleteVisible: { type: Boolean, default: false }
})

const conditionAnswers = ref({})
const minimumIntervalConfirmed = ref(false)

function setConditionAnswer(code, value) {
  conditionAnswers.value = { ...conditionAnswers.value, [code]: value }
}

function onMinimumIntervalChange(event) {
  minimumIntervalConfirmed.value = Boolean(event?.detail?.value?.includes('confirmed'))
}

const allConditionsAnswered = computed(() =>
  props.conditionRequirements.every(item => typeof conditionAnswers.value[item.code] === 'boolean')
)

const canSubmit = computed(
  () =>
    props.canComplete &&
    allConditionsAnswered.value &&
    (!props.requiresMinimumIntervalAcknowledgement || minimumIntervalConfirmed.value)
)

const completionBlockMessage = computed(() => {
  const messages = {
    fertilization_guard: '当前处于暂缓施肥状态，暂不能记录施肥。',
    plant_health: '植物当前状态异常，暂不能记录施肥。',
    monthly_pause: '本月按表暂停施肥。',
    monthly_avoid: '本月按表不建议施肥。',
    monthly_history_unavailable: '施肥记录暂时无法读取，暂不能确认是否施肥。',
    monthly_no_reliable_rule: '本月没有可靠的固定施肥周期。',
    conditions_unmet: '当前情况不满足本月施肥条件。',
    conditions_pending: '请先确认本月施肥条件。',
    monthly_not_due: '还没到本次施肥提醒日期。'
  }
  return messages[props.completionBlockReason] || '请以当前月度表为准。'
})

function buildCompletionPayload() {
  return {
    conditionAnswers: { ...conditionAnswers.value },
    acknowledgeMinimumInterval: minimumIntervalConfirmed.value
  }
}

function emitComplete() {
  emit('completeReminder', buildCompletionPayload())
}

function handleDismissClick() {
  emit('dismiss')
}

function handleCompleteClick() {
  if (!canSubmit.value) {
    return
  }
  emitComplete()
}

watch(
  () => [
    props.reminder?.planId,
    props.requiresMinimumIntervalAcknowledgement,
    props.conditionRequirements
  ],
  () => {
    conditionAnswers.value = {}
    minimumIntervalConfirmed.value = false
  }
)

function formatDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return match ? `${Number(match[2])}月${Number(match[3])}日` : '待定'
}
</script>
