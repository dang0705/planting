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
        @focus="handleFocus"
        @input="handleInput"
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
        @click="handleClearSearch"
      >
        <text class="text-base leading-none text-gray-400">×</text>
      </view>
    </view>
    <view
      v-if="showCancel"
      :id="`${idPrefix}-cancel-search-button`"
      class="flex h-[41px] shrink-0 items-center justify-center pl-0.5"
      @click="handleCancelSearch"
    >
      <text class="text-sm leading-5 text-[#2d7a4f]">取消</text>
    </view>
  </view>
</template>

<script setup>
import { computed, onBeforeUnmount, watch } from 'vue'
import aiIdentifyIcon from '@/assets/icons/ai-identify.svg'
import aiIdentifyPrimaryIcon from '@/assets/icons/ai-identify-primary.svg'
import searchIcon from '@/assets/icons/search.svg'
import { AUTOCOMPLETE_MIN_CHARS, fetchTropicalsFuzzySearch } from '@/api/tropicals.js'
import { createDebounced } from '@/utils/interaction-guard.js'

const SEARCH_DEBOUNCE_MS = 300
const DEFAULT_TROPICALS_LIMIT = 5

const props = defineProps({
  idPrefix: { type: String, default: 'add-plant' },
  aiText: { type: String, default: 'AI 拍照识别' },
  searchKeyword: { type: String, default: '' },
  searchPlaceholder: { type: String, default: '搜索植物' },
  compact: { type: Boolean, default: false },
  showCancel: { type: Boolean, default: false },
  /** 为 true 时工具栏自行防抖请求 Tropicals 模糊搜索（resolve + autocomplete），并向外 emit results / loading */
  useTropicals: { type: Boolean, default: false },
  tropicalsLimit: { type: Number, default: DEFAULT_TROPICALS_LIMIT }
})

const emit = defineEmits([
  'update:searchKeyword',
  'search-confirm',
  'clear-search',
  'ai-identify',
  'focus',
  'cancel-search',
  'results',
  'loading'
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

let tropicalsRequestSequence = 0

function emitLoading(value) {
  emit('loading', Boolean(value))
}

function emitResults(list) {
  emit('results', Array.isArray(list) ? list : [])
}

function resetTropicalsState() {
  tropicalsRequestSequence += 1
  debouncedTropicalsSearch.cancel()
  emitLoading(false)
  emitResults([])
}

async function runTropicalsSearch(keyword = '') {
  if (!props.useTropicals) {
    return
  }

  const normalizedKeyword = String(keyword || '').trim()
  // fetchTropicalsFuzzySearch 在不足 AUTOCOMPLETE_MIN_CHARS 时直接返回 [] 且不发请求
  if (normalizedKeyword.length < AUTOCOMPLETE_MIN_CHARS) {
    tropicalsRequestSequence += 1
    emitLoading(false)
    emitResults([])
    return
  }

  const sequence = ++tropicalsRequestSequence
  emitLoading(true)
  try {
    const list = await fetchTropicalsFuzzySearch(normalizedKeyword, {
      limit: props.tropicalsLimit
    })
    if (sequence !== tropicalsRequestSequence) {
      return
    }
    emitResults(list)
  } catch (error) {
    const message = String(error?.message || error || '')
    console.warn('[PlantSearchToolbar] Tropicals fuzzy search failed:', message || error)
    if (/Tropicals API Key|TROPICALS_API_KEY/i.test(message)) {
      uni.showToast({
        title: '缺少 Tropicals API Key，请检查 .env.local',
        icon: 'none',
        duration: 2800
      })
    }
    if (sequence === tropicalsRequestSequence) {
      emitResults([])
    }
  } finally {
    if (sequence === tropicalsRequestSequence) {
      emitLoading(false)
    }
  }
}

const debouncedTropicalsSearch = createDebounced(keyword => {
  runTropicalsSearch(keyword)
}, SEARCH_DEBOUNCE_MS)

function readInputValue(event) {
  if (event?.detail && event.detail.value != null) {
    return String(event.detail.value)
  }
  if (event?.target && event.target.value != null) {
    return String(event.target.value)
  }
  return ''
}

function handleInput(event) {
  const value = readInputValue(event)
  emit('update:searchKeyword', value)
  if (props.useTropicals) {
    debouncedTropicalsSearch(value)
  }
}

function handleFocus() {
  emit('focus')
  if (props.useTropicals) {
    // 再次聚焦时用当前关键字立即刷新建议（与原先首页行为一致）
    runTropicalsSearch(props.searchKeyword)
  }
}

function handleClearSearch() {
  emit('update:searchKeyword', '')
  emit('clear-search')
  if (props.useTropicals) {
    resetTropicalsState()
  }
}

function handleCancelSearch() {
  if (props.useTropicals) {
    resetTropicalsState()
  }
  emit('cancel-search')
}

watch(
  () => props.useTropicals,
  enabled => {
    if (!enabled) {
      resetTropicalsState()
    }
  }
)

// 受控 keyword 变化时也走防抖搜索，避免仅依赖 input 事件在部分端上丢失。
watch(
  () => props.searchKeyword,
  keyword => {
    if (!props.useTropicals) {
      return
    }
    debouncedTropicalsSearch(keyword)
  }
)

onBeforeUnmount(() => {
  if (props.useTropicals) {
    resetTropicalsState()
  } else {
    debouncedTropicalsSearch.cancel()
  }
})
</script>
