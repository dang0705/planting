<template>
  <Layout title="AI 诊断" content-class="bg-[#F8F6F0]">
    <view id="diagnose-tab-page" class="min-h-screen bg-[#F8F6F0] px-4 py-4">
      <DiagnoseFlow
        id="diagnose-tab-flow"
        plant-id=""
        plant-name=""
        diagnosis-profile="full"
        entry-source="diagnose_tab"
        :embedded="true"
      />
    </view>
  </Layout>
</template>

<script setup>
import Layout from '@/Layout.vue'
import DiagnoseFlow from '@/components/diagnose-flow/DiagnoseFlow.vue'
</script>
