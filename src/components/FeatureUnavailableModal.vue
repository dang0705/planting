<template>
  <view
    v-if="modelValue"
    id="feature-unavailable-modal"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-6"
  >
    <view class="w-full max-w-[620rpx] rounded-3xl bg-white p-6 shadow-xl">
      <text
        id="feature-unavailable-message"
        class="block text-center text-base leading-7 text-[#27322b]"
      >
        {{ message }}
      </text>
      <button
        id="feature-unavailable-confirm-button"
        class="mt-6 w-full rounded-2xl bg-[#2D7A4F] py-3 text-base font-semibold text-white"
        @click="close"
      >
        我知道了
      </button>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { FEATURE_UNAVAILABLE_MESSAGES } from '@/utils/feature-registry'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  featureKey: { type: String, default: '' }
})
const emit = defineEmits(['update:modelValue'])

const message = computed(
  () => FEATURE_UNAVAILABLE_MESSAGES[props.featureKey] || '当前端暂未开放该功能，敬请期待。'
)

function close() {
  emit('update:modelValue', false)
}
</script>
