<template>
  <Layout title="AI 诊断" content-class="bg-[#F8F6F0]">
    <view id="diagnose-tab-page" class="flex min-h-screen flex-col bg-[#F8F6F0]">
      <view id="diagnose-tab-intake" class="flex-1 px-4 pt-4">
        <DiagnoseIntake :view="intakeView" />
      </view>
      <view id="diagnose-tab-footer" class="border-t border-[#E5E7EB] bg-white px-4 py-3">
        <button
          id="diagnose-submit-button"
          class="w-full rounded-xl bg-primary py-3 font-semibold text-white"
          :class="{ 'opacity-50': !canStartDiagnoseNow }"
          :disabled="!canStartDiagnoseNow"
          @click="startDiagnosis"
        >
          {{ isStartingDiagnosis ? '正在生成问诊…' : '开始诊断' }}
        </button>
      </view>
    </view>
  </Layout>
</template>

<script setup>
import Layout from '@/Layout.vue'
import DiagnoseIntake from '@/components/diagnosis/DiagnoseIntake.vue'
import { useDiagnosisTabIntake } from './diagnosis-tab-intake.js'

const { intakeView, canStartDiagnoseNow, isStartingDiagnosis, startDiagnosis } =
  useDiagnosisTabIntake()
</script>
