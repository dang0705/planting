<template>
  <BottomSheet
    ref="bottomSheetRef"
    panel-id="login-modal-panel"
    content-id="login-modal-content"
    close-id="login-modal-close-button"
    :show-header="false"
    :show-close="false"
    :animation="true"
    :mask-click="!isLoggingIn && !platformLoggingIn"
    @close="handleSheetClose"
  >
    <view id="login-modal" class="w-full px-2 pb-4">
      <view
        id="login-modal-close-button"
        class="absolute right-5 top-5 flex size-9 items-center justify-center rounded-full active:bg-[#F4F8F5]"
        @click="handleCancel"
      >
        <uni-icons type="closeempty" size="20" color="#8A9A90" />
      </view>

      <view class="mt-7 flex flex-col items-center">
        <view class="flex size-16 items-center justify-center rounded-2xl bg-[#E8F5E9]">
          <image :src="leafIcon" class="size-7" mode="aspectFit" />
        </view>
        <text class="mt-4 text-xl font-semibold leading-7 text-[#1F2933]">手机号登录</text>
        <text class="mt-2 text-center text-sm leading-5 text-[#5A7A68]">
          {{ message || '登录后可同步您的植物养护记录' }}
        </text>
      </view>

      <!-- #ifdef MP-WEIXIN -->
      <button
        v-if="!isLoggingIn"
        id="login-modal-phone-login-button"
        class="m-0 mt-7 h-[52px] w-full rounded-2xl bg-[#2D7A4F] p-0 text-base font-semibold leading-[52px] text-white active:bg-[#256340]"
        open-type="getPhoneNumber"
        @getphonenumber="handleGetPhoneNumber"
      >
        使用手机号登录
      </button>
      <!-- #endif -->

      <!-- #ifdef MP-TOUTIAO || MP-XHS -->
      <button
        v-if="!platformLoggingIn"
        id="login-modal-platform-phone-login-button"
        class="m-0 mt-7 h-[52px] w-full rounded-2xl bg-[#2D7A4F] p-0 text-base font-semibold leading-[52px] text-white active:bg-[#256340]"
        :class="{ 'opacity-60': platformLoggingIn }"
        :disabled="platformLoggingIn"
        :open-type="loginCodeReady ? 'getPhoneNumber' : ''"
        @click="handlePlatformLoginTap"
        @getphonenumber="handlePlatformGetPhoneNumber"
      >
        {{ loginCodeReady ? '使用手机号登录' : '准备手机号登录' }}
      </button>
      <text v-if="loginPreparationError" class="mt-2 block text-center text-xs text-[#B42318]">
        {{ loginPreparationError }}
      </text>
      <!-- #endif -->

      <text
        v-if="loginError"
        id="login-modal-error"
        class="mt-2 block text-center text-xs text-[#B42318]"
      >
        {{ loginError }}
      </text>

      <view
        v-if="!isLoggingIn && !platformLoggingIn"
        id="login-modal-other-phone-login-button"
        class="mt-5 flex h-6 items-center justify-center active:opacity-60"
        @click="handleOtherPhoneLogin"
      >
        <text class="text-sm font-medium leading-6 text-[#2D7A4F]">其他手机号登录</text>
      </view>

      <view v-if="isLoggingIn || platformLoggingIn" class="mt-7 flex flex-col items-center py-3">
        <view
          class="size-9 rounded-full border-4 border-[#2D7A4F] border-t-transparent animate-spin"
        />
        <text class="mt-3 text-sm text-[#667085]">正在登录…</text>
      </view>

      <view id="login-modal-agreement" class="mt-7 flex items-start justify-center gap-2">
        <view
          class="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-[#2D7A4F]"
        >
          <uni-icons type="checkmarkempty" size="11" color="#FFFFFF" />
        </view>
        <text class="text-center text-xs leading-5 text-[#667085]">
          已阅读并同意
          <text class="text-[#2D7A4F]">《用户协议》</text>
          和
          <text class="text-[#2D7A4F]">《隐私政策》</text>
        </text>
      </view>
      <view id="login-modal-security-note" class="mt-3 flex items-center justify-center gap-1">
        <uni-icons type="locked" size="13" color="#8A9A90" />
        <text class="text-[11px] leading-4 text-[#8A9A90]">我们将严格保护您的个人信息安全</text>
      </view>
    </view>
  </BottomSheet>
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
import { nextTick, onMounted, ref, watch } from 'vue'
import BottomSheet from '@/components/common/BottomSheet.vue'
import { useUserStore } from '@/store/user'
import PlatformPrivacyModal from '@/components/PlatformPrivacyModal.vue'
import leafIcon from '@/assets/diagnosis/diagnosis-leaf.svg'
import { getActivePlatformAccessToken } from '@/api/platform-session.js'
import { usePlatformPhoneLogin } from '@/composables/usePlatformPhoneLogin.js'

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
const bottomSheetRef = ref(null)
const userStore = useUserStore()
const isLoggingIn = ref(false)
const loginError = ref('')
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

watch(
  () => props.show,
  async visible => {
    if (visible) {
      loginError.value = ''
    }
    await nextTick()
    if (visible) {
      bottomSheetRef.value?.open?.()
    } else {
      bottomSheetRef.value?.close?.()
    }
  },
  { immediate: true }
)

onMounted(() => {
  if (props.show) {
    bottomSheetRef.value?.open?.()
  }
})

async function handlePlatformLoginTap() {
  if (loginCodeReady.value || platformLoggingIn.value) {
    return
  }
  await prepareLoginCode()
}

async function handleGetPhoneNumber(event) {
  const phonePayload = {
    code: event?.detail?.code || '',
    cloudId: event?.detail?.cloudID || event?.detail?.cloudId || ''
  }

  if (!phonePayload.code && !phonePayload.cloudId) {
    loginError.value = '未完成手机号授权，请重试'
    return
  }

  loginError.value = ''
  isLoggingIn.value = true
  try {
    await userStore.phoneLogin(phonePayload)
    emit('success')
    emit('close')
  } catch (error) {
    console.error('手机号登录失败:', error)
    loginError.value = '登录失败，请稍后重试'
  } finally {
    isLoggingIn.value = false
  }
}

function handleOtherPhoneLogin() {
  loginError.value = '请使用当前平台绑定的手机号完成登录'
}

function handleCancel() {
  if (!isLoggingIn.value && !platformLoggingIn.value) {
    emit('close')
  }
}

function handleSheetClose() {
  if (props.show) {
    handleCancel()
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
