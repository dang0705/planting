<template>
  <view
    v-if="preview"
    id="fertilization-reminder-preview"
    class="mt-4 rounded-[14px] border border-[#D7E6DC] bg-[#F8FAF9] p-3"
  >
    <view class="flex items-start justify-between gap-2">
      <text class="min-w-0 flex-1 text-sm font-semibold text-[#1F2933]">
        {{ preview.reminderKind === 'first_confirmation' ? '首次确认提醒' : '下次施肥提醒' }}：{{
          previewDateText
        }}
      </text>
      <button
        id="fertilization-reminder-alert-info-button"
        class="m-0 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#7A9583] bg-white p-0 text-sm font-semibold leading-none text-[#52705E] after:border-0"
        hover-class="none"
        aria-label="查看施肥提醒"
        @click.stop="$emit('alert')"
      >
        <text class="leading-none">!</text>
      </button>
    </view>
    <view
      v-if="preview.reminderKind === 'first_confirmation'"
      id="fertilization-reminder-asserted-date-section"
      class="mt-3 rounded-xl bg-[#FFF7DF] p-2.5"
    >
      <text class="block text-[11px] leading-4 text-[#8A5A00]">
        如果记得上次施肥日期，可以补充后重新计算提醒。
      </text>
      <picker
        id="fertilization-reminder-asserted-date-picker"
        mode="date"
        :end="todayDate"
        @change="$emit('asserted-date-change', $event)"
      >
        <view
          class="mt-2 rounded-lg border border-[#E1E9DD] bg-white px-3 py-2 text-xs text-[#53645A]"
        >
          {{ assertedDate || '补充上次施肥日期' }}
        </view>
      </picker>
      <button
        v-if="assertedDate"
        id="fertilization-reminder-asserted-date-recalculate-button"
        class="mt-2 m-0 w-full rounded-lg bg-white py-2 text-xs font-semibold text-[#2D7A4F] after:border-0"
        hover-class="none"
        :disabled="loading"
        @click="$emit('recalculate-with-asserted-date', assertedDate)"
      >
        按此日期重新计算
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
      @click="$emit('confirm')"
    >
      {{
        loading
          ? '保存中…'
          : syncTerminalError
            ? '请先取消这次设置'
            : pendingCalendarPayload
              ? '重试同步'
              : preview.dueNow
                ? '保存提醒'
                : '设置日历'
      }}
    </button>
    <button
      id="fertilization-reminder-cancel-button"
      class="mt-2 m-0 w-full rounded-xl border border-[#E1E9DD] bg-white py-2.5 text-xs text-[#53645A] after:border-0"
      hover-class="none"
      @click="$emit('cancel')"
    >
      取消这次设置
    </button>
  </view>
</template>

<script setup>
defineProps({
  preview: { type: Object, default: null },
  previewDateText: { type: String, default: '待定' },
  loading: { type: Boolean, default: false },
  syncError: { type: String, default: '' },
  syncTerminalError: { type: Boolean, default: false },
  pendingCalendarPayload: { type: Object, default: null },
  assertedDate: { type: String, default: '' },
  todayDate: { type: String, default: '' }
})

defineEmits([
  'alert',
  'confirm',
  'cancel',
  'asserted-date-change',
  'recalculate-with-asserted-date'
])
</script>
