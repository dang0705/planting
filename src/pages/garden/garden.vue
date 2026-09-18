<template>
  <Layout title="我的花园" background-class="bg-[#F8F6F0]">
    <view id="garden-tab-page" class="min-h-screen bg-[#F8F6F0] pb-20">
      <UserPlantsSection ref="userPlantsRef" />
    </view>
  </Layout>
</template>

<script setup>
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import Layout from '@/Layout.vue'
import UserPlantsSection from '@/components/UserPlantsSection.vue'
import { useUserStore } from '@/store/user.js'

const userStore = useUserStore()
const userPlantsRef = ref(null)

onShow(() => {
  if (userStore.isAuthenticated) {
    userPlantsRef.value?.reload({ showLoading: false, preserveDiagnosisHistory: true })
  }
})
</script>
