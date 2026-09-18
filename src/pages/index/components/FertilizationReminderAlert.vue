<template>
  <view
    v-if="visible"
    id="fertilization-reminder-alert"
    class="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 px-8"
    role="dialog"
    aria-modal="true"
  >
    <view class="w-full overflow-hidden rounded-2xl bg-white" @tap.stop>
      <view class="px-5 pb-4 pt-5 text-center">
        <text class="block text-lg font-semibold text-[#1F2933]">{{ title }}</text>
        <view class="mt-4">
          <text
            v-for="line in contentLines"
            :key="line"
            class="block text-base leading-7 text-[#667085]"
          >
            {{ line }}
          </text>
        </view>
      </view>
      <view class="flex border-t border-[#E5E7EB]">
        <view
          id="fertilization-reminder-alert-cancel-button"
          class="flex h-12 flex-1 items-center justify-center text-base font-semibold text-[#1F2933]"
          role="button"
          @tap="$emit('cancel')"
        >
          {{ cancelText }}
        </view>
        <view class="h-12 w-px bg-[#E5E7EB]" />
        <view
          id="fertilization-reminder-alert-confirm-button"
          class="flex h-12 flex-1 items-center justify-center text-base font-semibold text-[#52705E]"
          role="button"
          @tap="$emit('confirm')"
        >
          {{ confirmText }}
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  content: { type: String, default: '' },
  title: { type: String, default: '施肥提醒' },
  cancelText: { type: String, default: '稍后设置' },
  confirmText: { type: String, default: '设置日历' }
})

defineEmits(['confirm', 'cancel'])

const contentLines = computed(() => String(props.content || '').split('\n'))
</script>
