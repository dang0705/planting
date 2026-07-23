<template>
  <scroll-view scroll-y class="h-screen">
    <view
      id="diagnose-question-package-retake-shell"
      class="box-border min-h-screen px-4 py-6 pb-9"
    >
      <RetakeCard
        :retake-request="retakeRequest"
        :retake-authorization-state="retakeAuthorizationState"
        :retake-countdown-text="retakeCountdownText"
        :retake-expired="retakeExpired"
        :has-active-retake-authorization="hasActiveRetakeAuthorization"
        @begin="$emit('begin')"
        @skip="$emit('skip')"
      />

      <view
        v-if="hasActiveRetakeAuthorization"
        id="diagnose-question-package-image-section"
        class="mt-4"
      >
        <text class="block text-sm font-semibold text-gray-900">上传补拍照片</text>
        <text class="mt-1 block text-xs leading-relaxed text-gray-500">
          按上方位置要求拍一张清晰照片，上传后继续判断。
        </text>

        <view v-for="(file, index) in files" :key="file.id" class="mt-3">
          <view class="relative aspect-square overflow-hidden rounded-xl bg-gray-100">
            <image :src="file.previewUrl" class="h-full w-full" mode="aspectFill" />
            <view
              v-if="file.loading"
              class="absolute inset-0 flex items-center justify-center bg-white/75"
            >
              <text class="text-xs font-semibold text-[#2d6a4f]">上传中</text>
            </view>
            <text
              v-else-if="file.status === 'error'"
              class="absolute inset-x-0 bottom-0 bg-red-500 px-3 py-2 text-xs text-white"
            >
              {{ file.error || '上传失败，请重新选择' }}
            </text>
            <view
              :id="`diagnose-question-package-remove-image-${index}-button`"
              class="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/55"
              @click="$emit('remove', index)"
            >
              <text class="text-base leading-none text-white">×</text>
            </view>
          </view>
        </view>

        <button
          v-if="canChooseImage"
          id="diagnose-question-package-upload-whole_plant-button"
          class="mt-3 h-[46px] w-full rounded-xl border border-dashed border-[#b7dcc5] bg-white p-0 text-sm font-semibold leading-[46px] text-[#2d6a4f]"
          @click="$emit('choose')"
        >
          选择补拍照片
        </button>
        <button
          id="diagnose-question-package-image-submit-button"
          class="mt-3 h-[48px] w-full rounded-xl bg-[#2d6a4f] p-0 text-sm font-semibold leading-[48px] text-white"
          :class="{ 'opacity-50': !canSubmitImage }"
          :disabled="!canSubmitImage"
          @click="$emit('submit')"
        >
          {{ isSubmittingImage ? '正在继续判断...' : '提交补拍照片' }}
        </button>
      </view>

      <button
        v-if="showRestartAction"
        id="diagnose-retake-expired-reset-button"
        class="mt-4 h-[46px] w-full rounded-xl border border-[#2d6a4f] bg-white p-0 text-sm font-semibold leading-[46px] text-[#2d6a4f]"
        @click="$emit('restart')"
      >
        重新诊断
      </button>
    </view>
  </scroll-view>
</template>

<script setup>
import RetakeCard from '@/components/diagnose-flow/RetakeCard.vue'

defineProps({
  retakeRequest: { type: Object, default: null },
  retakeAuthorizationState: { type: Object, default: null },
  retakeCountdownText: { type: String, default: '' },
  retakeExpired: { type: Boolean, default: false },
  hasActiveRetakeAuthorization: { type: Boolean, default: false },
  files: { type: Array, default: () => [] },
  canChooseImage: { type: Boolean, default: false },
  canSubmitImage: { type: Boolean, default: false },
  isSubmittingImage: { type: Boolean, default: false },
  showRestartAction: { type: Boolean, default: false }
})

defineEmits(['begin', 'skip', 'choose', 'remove', 'submit', 'restart'])
</script>
