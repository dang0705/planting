<template>
  <web-view v-if="source" id="agent-webview" :src="source" @error="loadFailed" />
  <Layout v-else title="小青" background-class="bg-[#F8F6F0]">
    <view
      id="agent-tab-page"
      class="flex min-h-[65vh] flex-col items-center justify-center px-8 text-center"
    >
      <text class="text-2xl font-semibold text-[#2d7a4f]">小青</text>
      <text class="mt-3 text-sm leading-7 text-[#788276]">{{ message }}</text>
      <button
        v-if="!loading"
        id="agent-entry-retry"
        class="mt-6 rounded-full bg-[#2d7a4f] px-8 text-sm text-white"
        @click="openAgent"
      >
        {{ userStore.isAuthenticated ? '重新连接' : '登录并开始聊天' }}
      </button>
    </view>
  </Layout>
</template>
<script setup>
import { ref } from 'vue'
import { onShow, onHide, onUnload } from '@dcloudio/uni-app'
import Layout from '@/Layout.vue'
import { useUserStore } from '@/store/user.js'
import { requestPhoneLogin } from '@/utils/phone-login-gate.js'
import { httpRequest } from '@/http-functions/core/httpRequest.js'
import { BASE_URL, IS_LOCAL_API_BASE_URL, PUBLIC_HTTP_FUNCTION_BASE_URL } from '@/api/env.js'
import { buildAgentEntryUrl, requestAgentEntryTicket } from './entry.js'
const userStore = useUserStore()
const source = ref(''),
  loading = ref(false),
  message = ref('和小青聊聊你的植物。')
const requestTicket = httpRequest({
  functionPath: 'agent-http/ticket',
  method: 'POST',
  requirePlatformSession: true
})
let generation = 0
async function openAgent() {
  if (loading.value) {
    return
  }
  const current = ++generation
  loading.value = true
  try {
    if (
      !userStore.isAuthenticated &&
      !(await requestPhoneLogin({ message: '登录后即可与小青聊天' }))
    ) {
      return
    }
    if (current !== generation) {
      return
    }
    message.value = '正在连接小青…'
    const ticket = await requestAgentEntryTicket(requestTicket)
    if (current === generation) {
      source.value = buildAgentEntryUrl(
        IS_LOCAL_API_BASE_URL ? BASE_URL : PUBLIC_HTTP_FUNCTION_BASE_URL,
        ticket
      )
    }
  } catch {
    if (current === generation) {
      message.value = '暂时无法连接小青，请稍后重试。'
    }
  } finally {
    if (current === generation) {
      loading.value = false
    }
  }
}
function loadFailed() {
  source.value = ''
  message.value = '页面暂时无法打开，请稍后重试。'
}
function leave() {
  generation += 1
  source.value = ''
  loading.value = false
}
onShow(() => openAgent())
onHide(leave)
onUnload(leave)
</script>
