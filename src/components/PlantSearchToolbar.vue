<template>
  <view :id="`${idPrefix}-search-toolbar`" class="flex items-center gap-2">
    <button
      :id="`${idPrefix}-ai-identify-button`"
      class="shrink-0 rounded-full p-0 text-sm font-semibold leading-5 after:border-0"
      :class="aiButtonClass"
      hover-class="none"
      :style="aiButtonStyle"
      @click="emit('ai-identify')"
    >
      <image :src="resolvedAiIdentifyIcon" class="size-4" mode="aspectFit" />
      <text class="shrink-0 whitespace-nowrap">{{ aiText }}</text>
    </button>

    <view class="min-w-0 flex-1" :class="searchContainerClass">
      <image
        v-if="compact && !searchKeyword"
        :src="searchIcon"
        class="mr-2 size-4 flex-[0_0_16px]"
        mode="aspectFit"
      />
      <input
        :id="`${idPrefix}-search-input`"
        :value="searchKeyword"
        type="text"
        :placeholder="searchPlaceholder"
        placeholder-style="color: rgba(10, 10, 10, 0.5)"
        confirm-type="search"
        class="min-w-0 flex-1 text-sm text-[#1f2937]"
        @focus="emit('focus')"
        @input="emit('update:searchKeyword', $event.detail.value)"
        @confirm="emit('search-confirm')"
      />
      <image
        v-if="!compact && !searchKeyword"
        :src="searchIcon"
        class="size-4 flex-[0_0_16px]"
        mode="aspectFit"
      />
      <view
        v-if="searchKeyword"
        :id="`${idPrefix}-clear-search-button`"
        class="flex size-6 shrink-0 items-center justify-center"
        @click="emit('clear-search')"
      >
        <text class="text-base leading-none text-gray-400">×</text>
      </view>
    </view>
    <view
      v-if="showCancel"
      :id="`${idPrefix}-cancel-search-button`"
      class="flex h-[41px] shrink-0 items-center justify-center pl-0.5"
      @click="emit('cancel-search')"
    >
      <text class="text-sm leading-5 text-[#2d7a4f]">取消</text>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import aiIdentifyIcon from '@/assets/icons/ai-identify.svg'
import aiIdentifyPrimaryIcon from '@/assets/icons/ai-identify-primary.svg'
import searchIcon from '@/assets/icons/search.svg'

const props = defineProps({
  idPrefix: { type: String, default: 'add-plant' },
  aiText: { type: String, default: 'AI 拍照识别' },
  searchKeyword: { type: String, default: '' },
  searchPlaceholder: { type: String, default: '搜索植物' },
  compact: { type: Boolean, default: false },
  showCancel: { type: Boolean, default: false }
})

const emit = defineEmits([
  'update:searchKeyword',
  'search-confirm',
  'clear-search',
  'ai-identify',
  'focus',
  'cancel-search'
])

const primaryButtonStyle =
  'background: linear-gradient(90deg, #00a63e 0%, #00bc7d 100%); box-shadow: 0 2px 4px rgba(0, 166, 62, 0.2), 0 4px 6px rgba(0, 166, 62, 0.2)'

const aiButtonStyle = computed(() => (props.compact ? '' : primaryButtonStyle))

const aiButtonClass = computed(() =>
  props.compact
    ? 'flex h-[41px] w-[101px] items-center justify-center gap-2 border border-[#2d7a4f] bg-white px-4 text-[#2d7a4f]'
    : 'flex h-11 w-[127px] items-center justify-center gap-1.5 px-0 text-white'
)

const resolvedAiIdentifyIcon = computed(() =>
  props.compact ? aiIdentifyPrimaryIcon : aiIdentifyIcon
)

const searchContainerClass = computed(() =>
  props.compact
    ? 'flex h-[41px] items-center rounded-full border border-[rgba(45,122,79,0.25)] bg-white px-4'
    : 'flex h-[45px] items-center rounded-full border border-[#2d7a4f] bg-white px-4'
)
</script>
