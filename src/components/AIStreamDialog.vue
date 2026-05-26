<template>
  <view v-if="visible" id="ai-stream-dialog" class="fixed top-0 left-0 right-0 bottom-0 bg-black/70 flex items-center justify-center z-[9999]">
    <view id="ai-stream-dialog-panel" class="bg-white rounded-[20px] w-[85%] max-h-[80vh] overflow-hidden flex flex-col">
      <!-- 标题栏 -->
      <view id="ai-stream-dialog-header" class="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <view class="flex items-center">
          <text class="text-xl mr-2">{{ icon }}</text>
          <text class="text-base font-semibold text-gray-800">{{ title }}</text>
        </view>
        <view
          v-if="!loading && canClose"
          id="ai-stream-close-button"
          class="w-8 h-8 flex items-center justify-center"
          @click="handleClose"
        >
          <text class="text-gray-400 text-xl">×</text>
        </view>
      </view>

      <!-- 内容区域 -->
      <scroll-view id="ai-stream-dialog-content" scroll-y class="flex-1 px-5 py-4 min-h-[200px] max-h-[400px]">
        <!-- 加载状态 -->
        <view v-if="loading && !streamText" id="ai-stream-loading" class="flex flex-col items-center py-8">
          <view class="w-10 h-10 border-3 border-gray-200 border-t-primary rounded-full animate-spin mb-3"></view>
          <text class="text-sm text-gray-500">{{ loadingText }}</text>
        </view>

        <!-- 流式文本显示 -->
        <view v-else id="ai-stream-text" class="text-sm text-gray-700 leading-relaxed">
          <text>{{ streamText }}</text>
          <text v-if="loading" class="inline-block w-2 h-4 bg-primary animate-pulse ml-1"></text>
        </view>
      </scroll-view>

      <!-- 底部操作区 -->
      <view v-if="showActions" id="ai-stream-actions" class="px-5 py-4 border-t border-gray-100 flex gap-3">
        <button
          v-if="showRetry && error"
          id="ai-stream-retry-button"
          class="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl text-sm"
          @click="handleRetry"
        >重试</button>
        <button
          v-if="!loading && showCancel && !error"
          id="ai-stream-cancel-button"
          class="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl text-sm"
          @click="handleCancel"
        >{{ cancelText }}</button>
        <button
          v-if="!loading"
          id="ai-stream-confirm-button"
          class="flex-1 py-3 text-white rounded-xl text-sm"
          style="background: linear-gradient(135deg, #2D7A4F 0%, #52B788 100%)"
          @click="handleConfirm"
        >{{ confirmText }}</button>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, watch, computed } from 'vue'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  title: {
    type: String,
    default: 'AI 识别'
  },
  icon: {
    type: String,
    default: '🔍'
  },
  loadingText: {
    type: String,
    default: '正在分析中...'
  },
  confirmText: {
    type: String,
    default: '确定'
  },
  cancelText: {
    type: String,
    default: '取消'
  },
  showCancel: {
    type: Boolean,
    default: false
  },
  showRetry: {
    type: Boolean,
    default: true
  },
  canClose: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['close', 'confirm', 'cancel', 'retry'])

const loading = ref(false)
const streamText = ref('')
const error = ref(null)
const result = ref(null)

const showActions = computed(() => {
  return !loading.value || error.value
})

// 暴露方法给父组件
function startStream() {
  loading.value = true
  streamText.value = ''
  error.value = null
  result.value = null
}

function appendText(text) {
  streamText.value += text
}

function setText(text) {
  streamText.value = text
}

function finishStream(data) {
  loading.value = false
  result.value = data
}

function setError(err) {
  loading.value = false
  error.value = err
  streamText.value = `识别失败: ${err.message || err}`
}

function handleClose() {
  emit('close')
}

function handleConfirm() {
  emit('confirm', result.value)
}

function handleCancel() {
  emit('cancel', result.value)
}

function handleRetry() {
  emit('retry')
}

// 重置状态
watch(() => props.visible, (val) => {
  if (!val) {
    loading.value = false
    streamText.value = ''
    error.value = null
    result.value = null
  }
})

defineExpose({
  startStream,
  appendText,
  setText,
  finishStream,
  setError,
  loading,
  streamText,
  result
})
</script>

<style scoped>
@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

.animate-spin {
  animation: spin 1s linear infinite;
}

.animate-pulse {
  animation: pulse 0.8s ease-in-out infinite;
}
</style>
