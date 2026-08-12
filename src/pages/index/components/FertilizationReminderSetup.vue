<template>
  <view id="fertilization-reminder-section" class="mt-4 rounded-[14px] bg-[#F8FAF9] p-3">
    <text class="block text-sm font-semibold text-[#1F2933]">设置施肥提醒</text>
    <text class="mt-1 block text-xs leading-5 text-[#667085]">
      选择肥料后，青花植会先计算日期，再由你确认是否加入手机日历。
    </text>

    <view class="mt-3">
      <text class="block text-xs font-semibold text-[#53645A]">选择这次使用的肥料</text>
      <view class="mt-2 grid grid-cols-2 gap-2">
        <button
          v-for="option in options"
          :id="`fertilization-reminder-option-${option.type === 'slowRelease' ? 'slow-release' : 'liquid'}`"
          :key="option.type"
          class="m-0 rounded-xl border px-3 py-2.5 text-left text-xs after:border-0"
          :class="
            selectedType === option.type
              ? 'border-[#2D7A4F] bg-[#E8F5E9] text-[#2D7A4F]'
              : 'border-[#E1E9DD] bg-white text-[#374151]'
          "
          hover-class="none"
          @click="$emit('select-type', option.type)"
        >
          <text class="block font-semibold">{{ option.label }}</text>
          <text class="mt-1 block leading-4 text-[#667085]">{{ option.cell.displayText }}</text>
        </button>
      </view>
    </view>

    <view v-if="!options.length" class="mt-3 rounded-xl bg-[#FFF7DF] p-3">
      <text class="text-xs leading-5 text-[#8A5A00]">本月没有可用于设置提醒的固定施肥周期。</text>
    </view>

    <button
      id="fertilization-reminder-preview-button"
      class="mt-3 m-0 w-full rounded-xl bg-[#2D7A4F] py-3 text-sm font-semibold text-white after:border-0 disabled:bg-gray-300"
      hover-class="none"
      :disabled="loading || !canPreview"
      @click="$emit('preview')"
    >
      {{ loading ? '正在计算…' : '设置下次施肥提醒' }}
    </button>
  </view>
</template>

<script setup>
defineProps({
  options: { type: Array, default: () => [] },
  selectedType: { type: String, default: '' },
  loading: { type: Boolean, default: false },
  canPreview: { type: Boolean, default: false }
})

defineEmits(['select-type', 'preview'])
</script>
