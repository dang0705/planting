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
      <view
        v-if="requiresExtraConfirmation"
        id="fertilization-reminder-extra-confirmation"
        class="mt-2 rounded-xl bg-[#FFF7DF] p-2.5"
      >
        <text class="block text-[11px] leading-4 text-[#8A5A00]">{{ extraConfirmationText }}</text>
        <checkbox-group
          id="fertilization-reminder-extra-confirmation-group"
          class="mt-2"
          @change="onExtraConfirmationChange"
        >
          <label class="flex items-center gap-2">
            <checkbox
              id="fertilization-reminder-extra-confirmation-checkbox"
              value="confirmed"
              :checked="extraConfirmed"
              color="#2D7A4F"
            />
            <text class="text-xs text-[#53645A]">我已确认，可以按本月规则处理</text>
          </label>
        </checkbox-group>
      </view>
      <button
        v-if="canComplete"
        id="fertilization-reminder-complete-button"
        class="mt-2 m-0 w-full rounded-xl bg-[#2D7A4F] py-2.5 text-sm font-semibold text-white after:border-0"
        hover-class="none"
        :disabled="requiresExtraConfirmation && !extraConfirmed"
        @click="$emit('complete', requiresExtraConfirmation ? extraConfirmed : true)"
      >
        今天已施肥
      </button>
      <button
        id="fertilization-reminder-dismiss-button"
        class="mt-2 m-0 w-full rounded-xl border border-[#E1E9DD] bg-white py-2.5 text-sm text-[#53645A] after:border-0"
        hover-class="none"
        @click="$emit('dismiss')"
      >
        本次跳过
      </button>
    </view>

    <button
      id="fertilization-reminder-reconfigure-button"
      class="mt-3 m-0 w-full rounded-xl border border-[#E1E9DD] bg-white py-2.5 text-xs text-[#53645A] after:border-0"
      hover-class="none"
      @click="$emit('reconfigure')"
    >
      重新设置提醒
    </button>
  </view>
</template>

<script setup>
import { computed, ref, watch } from 'vue'

defineEmits(['complete', 'dismiss', 'reconfigure'])

const props = defineProps({
  reminder: { type: Object, default: null },
  canComplete: { type: Boolean, default: false },
  currentMonthEvaluation: { type: Object, default: null },
  requiresExtraConfirmation: { type: Boolean, default: false },
  confirmationReasons: { type: Array, default: () => [] }
})

const extraConfirmed = ref(false)
const extraConfirmationText = computed(() => {
  const reasons = new Set(props.confirmationReasons)
  if (reasons.has('first_confirmation')) {
    return '这是首次确认提醒，目前没有可靠的上次施肥日期。'
  }
  if (reasons.has('conditional_rule')) {
    return '本月规则带有条件，请先确认条件确实满足。'
  }
  if (reasons.has('event_rule')) {
    return '本月规则对应特定生长事件，请先确认事件已经发生。'
  }
  if (reasons.has('plant_health')) {
    return '植物近期状态异常，施肥前请先确认当前状态允许施肥。'
  }
  if (reasons.has('fertilizer_type_changed')) {
    return '这次使用的肥料类型与上次不同，请先确认更换肥料。'
  }
  return '植物近期养护情况有变化，请先确认当前状态允许施肥。'
})

function onExtraConfirmationChange(event) {
  extraConfirmed.value = Boolean(event?.detail?.value?.includes('confirmed'))
}

watch(
  () => [props.reminder?.planId, props.requiresExtraConfirmation],
  () => {
    extraConfirmed.value = false
  }
)

function formatDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return match ? `${Number(match[2])}月${Number(match[3])}日` : '待定'
}
</script>
