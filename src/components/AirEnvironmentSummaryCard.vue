<template>
  <view :id="id" class="rounded-2xl border border-[rgba(45,122,79,0.16)] bg-white p-4 shadow-sm">
    <view class="flex items-start gap-3">
      <view class="mt-0.5 flex h-8 w-8 items-center justify-center rounded-xl bg-[#e8f5e9]">
        <text class="text-[15px] text-[#2d7a4f]">✓</text>
      </view>
      <view class="min-w-0 flex-1">
        <text class="block text-[15px] font-semibold leading-6 text-[#163324]">
          已使用这盆植物保存的空气环境
        </text>
        <text class="mt-1 block text-xs leading-5 text-[#5a7a68]">{{ summary }}</text>
        <text v-if="needsConfirmation" class="mt-2 block text-xs leading-5 text-[#9a5a14]">
          植物位置可能已变化，已带入旧资料，请确认或修改后继续。
        </text>
      </view>
    </view>
    <button
      :id="editButtonId"
      class="mt-3 h-9 rounded-xl border border-[#2d7a4f] bg-white px-3 text-xs font-semibold leading-9 text-[#2d7a4f]"
      @click="$emit('edit')"
    >
      环境有变化？修改
    </button>
    <button
      v-if="needsConfirmation"
      :id="confirmButtonId"
      class="ml-2 mt-3 h-9 rounded-xl bg-[#2d7a4f] px-3 text-xs font-semibold leading-9 text-white"
      @click="$emit('confirm')"
    >
      确认当前位置未变
    </button>
  </view>
</template>

<script setup>
defineProps({
  id: { type: String, default: 'air-environment-summary-card' },
  editButtonId: { type: String, default: 'air-environment-summary-edit' },
  confirmButtonId: { type: String, default: 'air-environment-summary-confirm-location' },
  summary: { type: String, default: '' },
  needsConfirmation: { type: Boolean, default: false }
})
defineEmits(['edit', 'confirm'])
</script>
