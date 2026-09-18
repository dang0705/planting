<template>
  <view
    v-if="isBlocking"
    id="mini-program-update-gate"
    class="fixed inset-0 z-[100] flex items-center justify-center bg-[#F8F6F0] px-6"
  >
    <view
      id="mini-program-update-panel"
      class="w-full max-w-[620rpx] rounded-3xl bg-white px-6 py-8 shadow-xl"
    >
      <view class="mx-auto flex size-16 items-center justify-center rounded-2xl bg-[#E8F5E9]">
        <view
          v-if="!isFailed"
          class="size-8 rounded-full border-4 border-[#2D7A4F] border-t-transparent animate-spin"
        />
        <text v-else class="text-3xl leading-none text-[#B42318]">!</text>
      </view>

      <text
        id="mini-program-update-title"
        class="mt-5 block text-center text-xl font-semibold leading-7 text-[#1F2933]"
      >
        {{ isFailed ? '更新未完成' : '正在更新' }}
      </text>
      <text
        id="mini-program-update-message"
        class="mt-2 block text-center text-sm leading-6 text-[#5A7A68]"
      >
        {{ message }}
      </text>

      <button
        v-if="isFailed"
        id="mini-program-update-retry-button"
        class="mt-6 w-full rounded-2xl bg-[#2D7A4F] py-3 text-base font-semibold text-white"
        @click="retry"
      >
        重新更新
      </button>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { MINI_PROGRAM_UPDATE_PHASES } from '@/utils/mini-program-update.js'

const props = defineProps({
  phase: { type: String, default: MINI_PROGRAM_UPDATE_PHASES.IDLE },
  hasUpdate: { type: Boolean, default: false }
})

const emit = defineEmits(['retry'])
const isFailed = computed(() => props.phase === MINI_PROGRAM_UPDATE_PHASES.FAILED)
const isRetrying = computed(
  () => props.phase === MINI_PROGRAM_UPDATE_PHASES.CHECKING && props.hasUpdate
)
const isBlocking = computed(
  () =>
    [
      MINI_PROGRAM_UPDATE_PHASES.DOWNLOADING,
      MINI_PROGRAM_UPDATE_PHASES.APPLYING,
      MINI_PROGRAM_UPDATE_PHASES.FAILED
    ].includes(props.phase) || isRetrying.value
)
const message = computed(() => {
  if (isFailed.value) {
    return '更新失败，请检查网络后重试'
  }
  if (isRetrying.value) {
    return '正在重新检查更新，请稍候…'
  }
  if (props.phase === MINI_PROGRAM_UPDATE_PHASES.APPLYING) {
    return '新版本已准备好，正在重启应用…'
  }
  return '发现新版本，正在下载，请稍候…'
})

function retry() {
  emit('retry')
}
</script>

<style scoped>
.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
