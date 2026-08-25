<template>
  <Layout title="AI 诊断" content-class="bg-[#F8F6F0]">
    <view id="diagnose-tab-page" class="min-h-screen bg-[#F8F6F0] px-4 py-8">
      <view class="rounded-3xl bg-white p-6 shadow-sm">
        <text class="block text-xl font-semibold text-gray-900">开始 AI 诊断</text>
        <text class="mt-2 block text-sm leading-6 text-gray-500">
          进入独立诊断页面，选择植物并完成拍照或无图问诊。
        </text>
        <button
          id="diagnose-tab-open-button"
          class="mt-6 w-full rounded-2xl bg-primary py-3.5 font-semibold text-white"
          @click="openDiagnosis"
        >
          开始诊断
        </button>
      </view>
    </view>
  </Layout>
</template>

<script setup>
import Layout from '@/Layout.vue'

function openDiagnosis() {
  uni.navigateTo({ url: '/subpackages/diagnosis/entry' })
}
</script>
