<template>
  <view
    v-if="modelValue"
    id="phone-auth-privacy-modal"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6"
  >
    <view class="w-full rounded-3xl bg-white p-5 shadow-xl">
      <text class="block text-lg font-semibold text-[#27322B]">隐私保护提示</text>
      <text class="mt-3 block text-sm leading-6 text-[#667085]">
        为完成手机号登录，我们会处理你的手机号并用于账号注册、登录和跨端同步。请先阅读并同意隐私保护协议。
      </text>
      <view class="mt-5 flex gap-3">
        <button
          id="phone-auth-privacy-contract"
          class="flex-1 rounded-2xl bg-[#F0F8F2] py-3 text-sm text-[#2D7A4F]"
          @click="$emit('open-contract')"
        >
          查看隐私协议
        </button>
        <button
          id="phone-auth-privacy-agree"
          class="flex-1 rounded-2xl bg-[#2D7A4F] py-3 text-sm text-white"
          open-type="agreePrivacyAuthorization"
          @agreeprivacyauthorization="$emit('agree')"
        >
          同意并继续
        </button>
      </view>
    </view>
  </view>
</template>

<script setup>
defineProps({ modelValue: { type: Boolean, default: false } })
defineEmits(['open-contract', 'agree'])
</script>
