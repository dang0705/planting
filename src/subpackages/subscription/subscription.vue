<template>
  <Layout title="会员服务" left-action="back" background-class="bg-[#F8F6F0]">
    <scroll-view id="subscription-page" scroll-y class="min-h-screen bg-[#F8F6F0] px-4 pb-8">
      <view class="pt-4">
        <view
          id="subscription-membership-summary"
          class="rounded-3xl bg-[#2D7A4F] px-5 py-5 text-white shadow-sm"
        >
          <view class="flex items-center justify-between">
            <view>
              <text class="block text-xs text-white/70">当前账户</text>
              <text id="subscription-membership-type" class="mt-1 block text-xl font-bold">
                {{ membershipText }}
              </text>
            </view>
            <text class="text-4xl">✦</text>
          </view>
          <text id="subscription-membership-expire" class="mt-3 block text-xs text-white/75">
            {{ membershipExpireText }}
          </text>
        </view>

        <view class="mt-6">
          <text class="block text-xl font-bold text-[#1F2933]">选择会员方案</text>
          <text class="mt-1 block text-sm leading-6 text-[#718075]">
            一次购买 30 天，不自动续费；已有会员从当前有效期结束后顺延
          </text>
        </view>

        <view
          v-if="plansLoading"
          id="subscription-plans-loading"
          class="mt-4 rounded-2xl bg-white px-4 py-8 text-center"
        >
          <text class="text-sm text-[#718075]">正在加载会员方案…</text>
        </view>

        <view
          v-else-if="plansError"
          id="subscription-plans-error"
          class="mt-4 rounded-2xl border border-[#F0DFBD] bg-[#FFFAF0] px-4 py-6 text-center"
        >
          <text class="block text-sm leading-6 text-[#8A6B36]">{{ plansError }}</text>
          <button
            id="subscription-plans-retry-button"
            class="mt-4 h-10 rounded-xl bg-[#2D7A4F] px-5 text-sm font-semibold leading-10 text-white"
            @click="loadPlans"
          >
            重新加载
          </button>
        </view>

        <view
          v-else-if="plans.length === 0"
          id="subscription-plans-empty"
          class="mt-4 rounded-2xl bg-white px-4 py-8 text-center"
        >
          <text class="block text-sm text-[#718075]">暂时没有可购买的会员方案</text>
        </view>

        <view v-else id="subscription-plan-list" class="mt-4">
          <view
            v-for="plan in plans"
            :id="`subscription-plan-${plan.id}`"
            :key="plan.id"
            class="mb-3 rounded-2xl border bg-white p-4 shadow-sm"
            :class="
              selectedPlanId === plan.id
                ? 'border-[#2D7A4F] ring-2 ring-[#D7E6DC]'
                : 'border-transparent'
            "
            @click="selectPlan(plan.id)"
          >
            <view class="flex items-start justify-between">
              <view class="flex-1 pr-3">
                <view class="flex items-center">
                  <text class="text-base font-bold text-[#1F2933]">{{ plan.name }}</text>
                  <text
                    v-if="selectedPlanId === plan.id"
                    :id="`subscription-plan-${plan.id}-selected`"
                    class="ml-2 rounded-full bg-[#E8F3EA] px-2 py-0.5 text-[10px] font-semibold text-[#2D7A4F]"
                  >
                    已选择
                  </text>
                </view>
                <text class="mt-1 block text-xs leading-5 text-[#718075]">
                  {{ plan.description }}
                </text>
              </view>
              <view class="text-right">
                <text class="block text-xl font-bold text-[#2D7A4F]">
                  {{ isPlanPayable(plan) ? `¥${plan.amountYuan}` : '免费' }}
                </text>
                <text class="mt-1 block text-[10px] text-[#9CA3AF]">
                  {{ isPlanPayable(plan) ? `${plan.durationDays} 天` : '免费' }}
                </text>
              </view>
            </view>
            <button
              :id="`subscription-plan-${plan.id}-pay-button`"
              class="mt-4 h-11 w-full rounded-xl bg-[#2D7A4F] p-0 text-sm font-bold leading-11 text-white"
              :class="{ 'opacity-50': paymentLoading || !isPlanPayable(plan) }"
              :disabled="paymentLoading || !isPlanPayable(plan)"
              @click.stop="startPayment(plan)"
            >
              {{
                !isPlanPayable(plan)
                  ? '当前方案'
                  : paymentLoading && selectedPlanId === plan.id
                    ? '处理中…'
                    : '立即购买'
              }}
            </button>
          </view>
        </view>

        <view
          v-if="paymentStatusText"
          id="subscription-payment-status"
          class="mt-4 rounded-2xl border px-4 py-4"
          :class="paymentSucceeded ? 'border-[#CFE5D4] bg-[#F2FAF4]' : 'border-[#E1E9DD] bg-white'"
        >
          <text
            id="subscription-payment-status-text"
            class="block text-sm leading-6"
            :class="paymentSucceeded ? 'font-semibold text-[#2D7A4F]' : 'text-[#53645A]'"
          >
            {{ paymentStatusText }}
          </text>
          <text
            v-if="currentOrder?.outTradeNo"
            id="subscription-payment-order-status"
            class="mt-1 block text-xs text-[#9CA3AF]"
          >
            订单状态：{{ orderStatusText }}
          </text>
          <button
            v-if="currentOrder?.outTradeNo && currentOrder.status !== 'paid' && !paymentLoading"
            id="subscription-refresh-order-button"
            class="mt-3 h-9 rounded-lg border border-[#2D7A4F] bg-white px-3 text-xs font-semibold leading-9 text-[#2D7A4F]"
            @click="refreshCurrentOrder"
          >
            刷新订单状态
          </button>
        </view>

        <text
          v-if="!restrictedPlatform"
          id="subscription-payment-notice"
          class="mt-6 block pb-6 text-xs leading-5 text-[#9CA3AF]"
        >
          会员购买由微信完成。支付成功后，系统会在收到微信通知并确认订单后更新会员状态。
        </text>
        <text
          v-else
          id="subscription-platform-unavailable-notice"
          class="mt-6 block pb-6 text-xs leading-5 text-[#9CA3AF]"
        >
          当前端暂未开放订阅服务，敬请期待。
        </text>
      </view>
    </scroll-view>
    <FeatureUnavailableModal v-model="featureUnavailableVisible" :feature-key="openedFeatureKey" />
  </Layout>
</template>

<script setup>
import { computed, ref } from 'vue'
import {
  fetchSubscriptionOrder,
  fetchSubscriptionPlans,
  createSubscriptionOrder
} from '@/api/subscription.js'
import Layout from '@/Layout.vue'
import FeatureUnavailableModal from '@/components/FeatureUnavailableModal.vue'
import { useUserStore } from '@/store/user.js'
import { onLoad } from '@dcloudio/uni-app'
import { useFeatureUnavailableModal } from '@/utils/feature-registry.js'
import { isRestrictedMiniProgram } from '@/utils/platform-capabilities.js'

const ORDER_CONFIRM_ATTEMPTS = 8
const ORDER_CONFIRM_INTERVAL_MS = 1500

const userStore = useUserStore()
const plans = ref([])
const selectedPlanId = ref('')
const plansLoading = ref(false)
const plansError = ref('')
const paymentLoading = ref(false)
const paymentStage = ref('')
const paymentMessage = ref('')
const paymentError = ref('')
const currentOrder = ref(null)
const requestIds = new Map()
const restrictedPlatform = isRestrictedMiniProgram()
const {
  openedFeatureKey,
  visible: featureUnavailableVisible,
  openFeatureUnavailable
} = useFeatureUnavailableModal()

const membershipText = computed(() => {
  if (userStore.isPremium) {
    return '高级会员'
  }
  if (userStore.isMember) {
    return '基础会员'
  }
  return '免费账户'
})
const membershipExpireText = computed(() => {
  if (!userStore.isMember) {
    return '当前为免费账户，选择方案即可升级'
  }
  return `有效期至 ${formatDate(userStore.membership.expireTime)}`
})
const paymentStatusText = computed(
  () => paymentError.value || paymentMessage.value || paymentStage.value
)
const paymentSucceeded = computed(() => currentOrder.value?.status === 'paid')
const orderStatusText = computed(() => {
  const status = currentOrder.value?.status
  if (status === 'paid') {
    return '已支付'
  }
  if (status === 'prepay_created') {
    return '待支付'
  }
  if (status === 'prepay_processing') {
    return '创建中'
  }
  if (status === 'prepay_failed') {
    return '创建失败'
  }
  return status || '待确认'
})

onLoad(() => {
  if (restrictedPlatform) {
    openFeatureUnavailable('subscription')
    return
  }
  loadPlans()
})

async function loadPlans() {
  if (plansLoading.value) {
    return
  }
  plansLoading.value = true
  plansError.value = ''
  clearPaymentStatus()
  try {
    plans.value = await fetchSubscriptionPlans()
    if (!plans.value.some(plan => plan.id === selectedPlanId.value)) {
      selectedPlanId.value = plans.value[0]?.id || ''
    }
  } catch (error) {
    plans.value = []
    selectedPlanId.value = ''
    plansError.value = error?.message || '会员方案暂时无法加载，请稍后重试。'
  } finally {
    plansLoading.value = false
  }
}

function selectPlan(planId) {
  if (!paymentLoading.value) {
    selectedPlanId.value = planId
    clearPaymentStatus()
  }
}

function isPlanPayable(plan) {
  return plan?.payable === true && Number(plan.amountFen) > 0
}

function getClientRequestId(planId) {
  if (!requestIds.has(planId)) {
    const random = Math.random().toString(36).slice(2, 10)
    requestIds.set(planId, `subscription_${Date.now().toString(36)}_${random}`.slice(0, 64))
  }
  return requestIds.get(planId)
}

async function startPayment(plan) {
  if (restrictedPlatform) {
    openFeatureUnavailable('subscription')
    return
  }
  if (paymentLoading.value || !plan?.id || !isPlanPayable(plan)) {
    return
  }
  if (!(await userStore.ensureLogin())) {
    paymentError.value = '请先登录后再购买会员。'
    paymentStage.value = ''
    paymentMessage.value = ''
    return
  }

  paymentLoading.value = true
  clearPaymentStatus()
  paymentStage.value = '正在创建支付订单…'
  try {
    const result = await createSubscriptionOrder({
      planId: plan.id,
      clientRequestId: getClientRequestId(plan.id)
    })
    currentOrder.value = result.order
    if (result.order?.status === 'paid') {
      await settlePaidOrder(result.order)
      return
    }
    if (!result.payment) {
      paymentStage.value = ''
      paymentError.value = '订单正在处理中，请稍后刷新订单状态。'
      return
    }

    paymentStage.value = '请在微信支付窗口完成付款…'
    await requestWechatPayment(result.payment)
    paymentStage.value = '支付已提交，正在确认会员状态…'
    const confirmedOrder = await waitForPaidOrder(result.order.outTradeNo)
    if (confirmedOrder?.status === 'paid') {
      await settlePaidOrder(confirmedOrder)
      return
    }
    paymentStage.value = ''
    paymentError.value = '支付已提交，但订单还在确认中，请稍后刷新订单状态。'
  } catch (error) {
    if (error?.statusCode === 409 && error.data?.order) {
      currentOrder.value = error.data.order
      paymentStage.value = ''
      paymentError.value = '订单正在处理中，请稍后刷新订单状态。'
    } else if (isPaymentCancelled(error)) {
      paymentStage.value = ''
      paymentError.value = '你已取消支付，可重新选择方案。'
    } else {
      paymentStage.value = ''
      paymentError.value = error?.message || '支付暂未完成，请稍后重试。'
    }
  } finally {
    paymentLoading.value = false
  }
}

async function refreshCurrentOrder() {
  if (paymentLoading.value || !currentOrder.value?.outTradeNo) {
    return
  }
  paymentLoading.value = true
  clearPaymentStatus()
  paymentStage.value = '正在刷新订单状态…'
  try {
    const order = await fetchSubscriptionOrder(currentOrder.value.outTradeNo)
    currentOrder.value = order
    if (order?.status === 'paid') {
      await settlePaidOrder(order)
    } else {
      paymentStage.value = ''
      paymentError.value = '订单尚未完成支付，请稍后再试。'
    }
  } catch (error) {
    paymentStage.value = ''
    paymentError.value = error?.message || '订单状态暂时无法获取，请稍后重试。'
  } finally {
    paymentLoading.value = false
  }
}

async function waitForPaidOrder(outTradeNo) {
  let latestOrder = null
  for (let attempt = 0; attempt < ORDER_CONFIRM_ATTEMPTS; attempt += 1) {
    try {
      latestOrder = await fetchSubscriptionOrder(outTradeNo)
      if (latestOrder?.status === 'paid') {
        return latestOrder
      }
    } catch {
      // 微信通知和订单查询可能存在短暂延迟，保留有限次数的确认机会。
    }
    if (attempt < ORDER_CONFIRM_ATTEMPTS - 1) {
      await wait(ORDER_CONFIRM_INTERVAL_MS)
    }
  }
  return latestOrder
}

async function settlePaidOrder(order) {
  currentOrder.value = order
  requestIds.delete(order?.planId)
  paymentStage.value = ''
  const refreshed = await userStore.refreshUserInfo()
  if (refreshed && userStore.isMember) {
    paymentMessage.value = `会员已生效，有效期至 ${formatDate(userStore.membership.expireTime)}。`
  } else {
    paymentMessage.value = '支付已完成，会员信息正在同步，请稍后返回个人中心查看。'
  }
}

function clearPaymentStatus() {
  paymentStage.value = ''
  paymentMessage.value = ''
  paymentError.value = ''
}

function isPaymentCancelled(error) {
  return /cancel/u.test(String(error?.errMsg || error?.message || '').toLowerCase())
}

function requestWechatPayment(payment) {
  return new Promise((resolve, reject) => {
    // #ifdef MP-WEIXIN
    uni.requestPayment({
      provider: 'wxpay',
      ...payment,
      success: resolve,
      fail: reject
    })
    // #endif
    // #ifndef MP-WEIXIN
    reject(new Error('请在微信小程序中完成支付。'))
    // #endif
  })
}

function wait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

function formatDate(value) {
  const numericValue = Number(value)
  const timestamp =
    typeof value === 'number' || (String(value || '').trim() && Number.isFinite(numericValue))
      ? numericValue
      : Date.parse(String(value || ''))
  if (!Number.isFinite(timestamp)) {
    return '待同步'
  }
  const date = new Date(timestamp)
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}
</script>
