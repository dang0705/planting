<template>
  <view v-if="show" class="fixed inset-0 z-50 flex items-center justify-center">
    <!-- 遮罩层 -->
    <view
      id="login-modal-backdrop"
      class="absolute inset-0 bg-black/50"
      @click="handleCancel"
    ></view>

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

      <!-- #ifdef MP-TOUTIAO || MP-XHS -->
      <button
        v-if="!isLoggingIn && !platformLoggingIn"
        id="login-modal-platform-phone-login-button"
        class="w-full bg-primary text-white font-semibold py-4 rounded-2xl mb-3 flex items-center justify-center"
        :class="{ 'opacity-60': platformLoggingIn }"
        :disabled="platformLoggingIn"
        :open-type="loginCodeReady ? 'getPhoneNumber' : ''"
        @click="handlePlatformLoginTap"
        @getphonenumber="handlePlatformGetPhoneNumber"
      >
        <text class="text-base">
          {{ loginCodeReady ? '📱 授权手机号快捷登录' : '📱 准备手机号登录' }}
        </text>
      </button>
      <text v-if="loginPreparationError" class="block text-xs text-center text-[#B42318] mt-2">
        {{ loginPreparationError }}
      </text>
      <!-- #endif -->

      <!-- 登录中 -->
      <view v-if="isLoggingIn || platformLoggingIn" class="flex flex-col items-center py-4">
        <view
          class="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-3"
        ></view>
        <text class="text-sm text-gray-600">登录中...</text>
      </view>

      <!-- 提示信息 -->
      <text class="block text-xs text-center text-gray-500 mt-4">
        请通过当前平台的手机号授权完成登录。
      </text>
      <text class="block text-xs text-center text-gray-500 mt-2">
        登录即表示同意《用户协议》和《隐私政策》
      </text>
    </view>
  </view>
  <!-- #ifdef MP-TOUTIAO -->
  <PlatformPrivacyModal
    v-if="show"
    :model-value="privacyVisible"
    @open-contract="openPrivacyContract"
    @agree="agreePrivacyAuthorization"
  />
  <!-- #endif -->
</template>

<script setup>
import { ref } from 'vue'
import { useUserStore } from '@/store/user'
import PlatformPrivacyModal from '@/components/PlatformPrivacyModal.vue'
import { getActivePlatformAccessToken } from '@/api/platform-session.js'
import { usePlatformPhoneLogin } from '@/composables/usePlatformPhoneLogin.js'

defineProps({
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
const {
  loginCodeReady,
  loginPreparationError,
  loggingIn: platformLoggingIn,
  handleGetPhoneNumber: handlePlatformGetPhoneNumber,
  privacyVisible,
  openPrivacyContract,
  agreePrivacyAuthorization,
  prepareLoginCode
} = usePlatformPhoneLogin({
  onSuccess: async user => {
    await userStore.setLoginInfo({
      user,
      token: getActivePlatformAccessToken()
    })
    emit('success')
    emit('close')
  }
})

async function handlePlatformLoginTap() {
  if (loginCodeReady.value || platformLoggingIn.value) {
    return
  }
  await prepareLoginCode()
}

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
      title: '登录失败，请稍后重试',
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
  if (!isLoggingIn.value && !platformLoggingIn.value) {
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
