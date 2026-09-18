<template>
  <BottomSheet
    ref="popupRef"
    panel-id="fertilization-reminder-calendar-delete"
    content-id="fertilization-reminder-calendar-delete-content"
    close-id="fertilization-reminder-calendar-delete-close-button"
    title="删除日历施肥提醒"
    height-mode="auto"
    :mask-click="!loading"
    @change="handleSheetChange"
  >
    <view id="fertilization-reminder-calendar-delete-body" class="pb-1">
      <text class="block rounded-[14px] bg-[#FFF7DF] p-3 text-xs leading-5 text-[#8A5A00]">
        青花植无法删除手机日历中的施肥提醒。请先在手机日历删除，再回到这里确认。
      </text>
      <checkbox-group
        id="fertilization-reminder-calendar-delete-group"
        class="mt-3"
        @change="$emit('change', $event)"
      >
        <label class="flex items-center gap-2">
          <checkbox
            id="fertilization-reminder-calendar-delete-ack"
            value="deleted"
            :checked="acknowledged"
            color="#2D7A4F"
          />
          <text class="text-xs text-[#53645A]">我已手动删除手机日历中的施肥提醒</text>
        </label>
      </checkbox-group>
      <button
        id="fertilization-reminder-calendar-delete-confirm"
        class="mt-3 m-0 w-full rounded-xl bg-[#2D7A4F] py-2.5 text-xs font-semibold text-white after:border-0 disabled:bg-gray-300"
        hover-class="none"
        :disabled="!acknowledged || loading"
        @click="$emit('confirm')"
      >
        确认已删除日历提醒
      </button>
      <button
        id="fertilization-reminder-calendar-delete-dismiss"
        class="mt-2 m-0 w-full rounded-xl border border-[#E1E9DD] bg-white py-2.5 text-xs text-[#53645A] after:border-0"
        hover-class="none"
        @click="$emit('cancel')"
      >
        暂不处理
      </button>
    </view>
  </BottomSheet>
</template>

<script setup>
import { ref } from 'vue'
import BottomSheet from '@/components/common/BottomSheet.vue'
import { callComponentMethod } from '@/utils/component-ref.js'

const emit = defineEmits(['change', 'confirm', 'cancel'])
const popupRef = ref(null)

defineProps({
  acknowledged: { type: Boolean, default: false },
  loading: { type: Boolean, default: false }
})

function open() {
  callComponentMethod(popupRef, 'open')
}

function close() {
  callComponentMethod(popupRef, 'close')
}

function handleSheetChange(event) {
  if (!event?.show) {
    emit('cancel')
  }
}

defineExpose({ open, close })
</script>
