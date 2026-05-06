<template>
  <view v-if="show" class="fixed inset-0 z-50 flex items-center justify-center">
    <!-- 遮罩层 -->
    <view class="absolute inset-0 bg-black/50" @click="handleCancel"></view>

    <!-- 登录弹窗 -->
    <view class="relative bg-white rounded-3xl p-8 mx-6 w-full max-w-sm shadow-2xl">
      <!-- 关闭按钮 -->
      <view
        id="login-modal-close-button"
        class="absolute top-4 right-4 w-8 h-8 flex items-center justify-center"
        @click="handleCancel"
      >
        <text class="text-2xl text-gray-400">×</text>
      </view>

      <!-- 图标 -->
      <view class="flex justify-center mb-6">
        <view class="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center">
          <text class="text-4xl">🌱</text>
        </view>
      </view>

      <!-- 标题 -->
      <text class="block text-2xl font-bold text-center text-gray-900 mb-2">需要登录</text>
      <text class="block text-sm text-center text-gray-600 mb-8">
        {{ message || '使用 AI 功能需要先登录' }}
      </text>

      <!-- 登录按钮 -->
      <!-- #ifdef MP-WEIXIN -->
      <button
        v-if="!isLoggingIn"
        id="login-modal-phone-login-button"
        class="w-full bg-primary text-white font-semibold py-4 rounded-2xl mb-3 flex items-center justify-center"
        open-type="getPhoneNumber"
        @getphonenumber="handleGetPhoneNumber"
      >
        <text class="text-base">📱 微信手机号登录</text>
      </button>
      <!-- #endif -->

      <!-- #ifndef MP-WEIXIN -->
      <button
        v-if="!isLoggingIn"
        id="login-modal-phone-login-unavailable-button"
        class="w-full bg-gray-100 text-gray-500 font-semibold py-4 rounded-2xl mb-3 flex items-center justify-center"
        @click="handlePhoneLoginUnavailable"
      >
        <text class="text-base">📱 手机号登录接入中</text>
      </button>
      <!-- #endif -->

      <!-- 快速登录按钮 -->
      <button
        v-if="!isLoggingIn"
        id="login-modal-quick-login-button"
        class="w-full bg-gray-100 text-gray-700 font-semibold py-4 rounded-2xl flex items-center justify-center"
        @click="handleQuickLogin"
      >
        <text class="text-base">⚡ 快速登录</text>
      </button>

      <!-- 登录中 -->
      <view v-if="isLoggingIn" class="flex flex-col items-center py-4">
        <view
          class="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-3"
        ></view>
        <text class="text-sm text-gray-600">登录中...</text>
      </view>

      <!-- 提示信息 -->
      <text class="block text-xs text-center text-gray-500 mt-4">
        微信端支持手机号桥接登录，其他小程序端会后续接入。
      </text>
      <text class="block text-xs text-center text-gray-500 mt-2">
        登录即表示同意《用户协议》和《隐私政策》
      </text>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { useUserStore } from '@/store/user'

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  message: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['close', 'success'])

const userStore = useUserStore()
const isLoggingIn = ref(false)

/**
 * 处理获取手机号
 */
async function handleGetPhoneNumber(e) {
  const phonePayload = {
    code: e?.detail?.code || '',
    cloudId: e?.detail?.cloudID || e?.detail?.cloudId || ''
  }

  if (!phonePayload.code && !phonePayload.cloudId) {
    console.log('用户取消授权手机号或未返回有效桥接参数:', e?.detail)
    return
  }

  isLoggingIn.value = true
  try {
    await userStore.phoneLogin(phonePayload)

    uni.showToast({
      title: '登录成功',
      icon: 'success'
    })

    emit('success')
    emit('close')
  } catch (error) {
    console.error('手机号登录失败:', error)
    uni.showToast({
      title: error.message || '登录失败',
      icon: 'none'
    })
  } finally {
    isLoggingIn.value = false
  }
}

function handlePhoneLoginUnavailable() {
  uni.showToast({
    title: '当前平台手机号登录接入中',
    icon: 'none'
  })
}

/**
 * 快速登录（使用 code）
 */
async function handleQuickLogin() {
  try {
    await userStore.wechatLogin()
    uni.showToast({
      title: '登录成功',
      icon: 'success'
    })
    isLoggingIn.value = true
    emit('success')
    emit('close')
  } catch (error) {
    console.error('快速登录失败:', error)
    uni.showToast({
      title: error.message || '登录失败',
      icon: 'none'
    })
  } finally {
    isLoggingIn.value = false
  }
}

/**
 * 取消登录
 */
function handleCancel() {
  if (!isLoggingIn.value) {
    emit('close')
  }
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
