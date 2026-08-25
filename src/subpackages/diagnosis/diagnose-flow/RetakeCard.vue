<template>
  <view id="diagnose-retake-card" class="mb-3">
    <text class="block text-sm font-semibold text-gray-900 mb-2">补拍确认</text>
    <view class="rounded-xl border border-[#B7DCC5] bg-[#F3FAF5] p-3">
      <text v-if="retakeExpired" class="block text-xs font-semibold text-[#8B3A2F]">
        补拍时间已结束
      </text>
      <text v-else-if="retakeSkippedUnknown" class="block text-xs font-semibold text-[#8B3A2F]">
        已跳过补拍
      </text>
      <text v-else class="block text-xs font-semibold text-[#1F5A42]">
        {{ hasActiveRetakeAuthorization ? '补拍已开始' : '需要先确认开始补拍' }}
      </text>
      <text
        v-if="retakeSkippedUnknown"
        id="diagnose-retake-skipped-text"
        class="mt-2 block text-[11px] leading-relaxed text-gray-600"
      >
        本次暂不能继续判断，请重新诊断。
      </text>
      <template v-else>
        <text
          v-if="retakeRequest?.requestedCaptureRegion"
          id="diagnose-retake-requested-region"
          class="mt-1.5 block text-[11px] text-[#2D6A4F]"
        >
          补拍位置：{{ readableCaptureRegion }}
        </text>
        <text
          v-if="retakeRequest?.reason"
          id="diagnose-retake-reason"
          class="mt-1 block text-[11px] leading-relaxed text-gray-600"
        >
          原因：{{ readableReason }}
        </text>
        <text
          v-if="retakeRequest?.captureInstruction || retakeRequest?.howToCapture"
          id="diagnose-retake-how"
          class="mt-1.5 block text-[11px] leading-relaxed text-gray-600"
        >
          怎么拍：{{ retakeRequest.captureInstruction || retakeRequest.howToCapture }}
        </text>
        <text class="mt-1.5 block text-[11px] leading-relaxed text-gray-600">
          {{ retakeRequest?.riskNotice || '开始后需要在 3 分钟内上传补拍照片。' }}
        </text>
        <view
          v-if="safetyInstructions.length"
          id="diagnose-retake-safety-instructions"
          class="mt-2 rounded-lg bg-white/70 px-2.5 py-2"
        >
          <text class="block text-[11px] font-semibold text-[#1F5A42]">操作前请注意</text>
          <text
            v-for="instruction in safetyInstructions"
            :key="instruction"
            class="mt-1 block text-[11px] leading-relaxed text-gray-600"
          >
            {{ instruction }}
          </text>
        </view>
        <text class="mt-1 block text-[11px] leading-relaxed text-gray-600">
          确认开始后，请在 3 分钟内完成拍摄并提交。
        </text>
      </template>
      <text
        v-if="retakeCountdownText"
        id="diagnose-retake-countdown"
        class="mt-2 block text-sm font-black text-[#2D6A4F]"
      >
        {{ retakeCountdownText }}
      </text>
      <text
        v-if="retakeExpired"
        id="diagnose-retake-ended-title"
        class="mt-2 block text-xs font-semibold text-[#8B3A2F]"
      >
        本次诊断已结束，请重新开始
      </text>
      <button
        v-if="canStartRetake"
        id="diagnose-retake-start-button"
        class="mt-3 h-[42px] w-full rounded-xl bg-[#2D6A4F] p-0 text-sm font-semibold leading-[42px] text-white"
        @click="$emit('begin')"
      >
        开始补拍
      </button>
      <button
        v-if="canSkipRiskRetake && canStartRetake"
        id="diagnose-retake-skip-button"
        class="mt-2 h-[38px] w-full rounded-xl bg-white p-0 text-xs font-semibold leading-[38px] text-[#8B3A2F]"
        @click="$emit('skip')"
      >
        不敢操作 / 跳过
      </button>
      <text
        v-if="retakeExpired"
        id="diagnose-retake-expired-text"
        class="mt-3 block text-[11px] text-gray-500"
      >
        本次诊断已结束，请重新开始
      </text>
    </view>
  </view>
</template>

<script>
import { canShowRetakeStartButton, isRetakeSkippedUnknown } from './retake-clock'

export default {
  props: {
    retakeRequest: { type: Object, default: null },
    retakeAuthorizationState: { type: Object, default: null },
    retakeCountdownText: { type: String, default: '' },
    retakeExpired: { type: Boolean, default: false },
    hasActiveRetakeAuthorization: { type: Boolean, default: false }
  },
  emits: ['begin', 'skip'],
  computed: {
    canSkipRiskRetake() {
      const riskLevel = String(this.retakeRequest?.riskLevel || '').trim()
      return Boolean(
        this.retakeRequest?.skipOptionEnabled || riskLevel === 'medium' || riskLevel === 'high'
      )
    },
    canStartRetake() {
      return canShowRetakeStartButton({
        hasActiveRetakeAuthorization: this.hasActiveRetakeAuthorization,
        retakeExpired: this.retakeExpired,
        retakeSkippedUnknown: this.retakeSkippedUnknown
      })
    },
    retakeSkippedUnknown() {
      return isRetakeSkippedUnknown(this.retakeRequest, this.retakeAuthorizationState)
    },
    readableCaptureRegion() {
      const region = String(this.retakeRequest?.requestedCaptureRegion || '').trim()
      const labels = {
        leaf_lower_surface: '叶片背面',
        leaf_upper_surface: '叶片正面',
        leaf_edge: '叶片边缘',
        new_growth: '新芽附近',
        stem_surface: '茎表面',
        node_leaf_axil: '茎节和叶腋附近',
        whole_plant_overview: '整株',
        root_surface: '根表面',
        root_crown: '根茎交界处',
        soil_surface: '盆土表面',
        flower: '花朵附近',
        fruit: '果实附近',
        other_local: '可疑位置近照'
      }
      return labels[region] || this.retakeRequest?.requestedCaptureRegionText || '可疑位置近照'
    },
    readableReason() {
      const reason = String(this.retakeRequest?.reason || '').trim()
      const labels = {
        visual_confirmation_needed: '当前照片还不能看清关键细节，需要补一张近照确认。',
        pest_confirmation_needed: '当前照片有虫害线索，但需要补一张更清楚的近照。',
        specific_pest_confirmation_needed: '当前照片有虫害线索，但需要补一张更清楚的近照。',
        low_visual_quality: '当前照片不够清楚，需要补一张更稳定的照片。',
        low_confidence_visual: '当前照片清晰度不足，需要补充更稳定的照片。'
      }
      return labels[reason] || this.retakeRequest?.reasonText || '需要补充关键细节后再判断。'
    },
    safetyInstructions() {
      return (
        Array.isArray(this.retakeRequest?.safetyInstructions)
          ? this.retakeRequest.safetyInstructions
          : []
      )
        .map(item => String(item || '').trim())
        .filter(Boolean)
    }
  }
}
</script>
