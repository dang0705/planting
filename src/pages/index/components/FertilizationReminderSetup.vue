<template>
  <view id="fertilization-reminder-section" class="mt-4">
    <view>
      <view class="mt-2 grid grid-cols-2 gap-2">
        <button
          v-for="option in options"
          :id="`fertilization-reminder-option-${option.type === 'slowRelease' ? 'slow-release' : 'liquid'}`"
          :key="option.type"
          class="m-0 rounded-xl border px-3 py-2.5 text-left text-xs after:border-0"
          :class="
            selectedType === option.type
              ? 'border-[#2D7A4F] bg-[#E8F5E9] text-[#2D7A4F]'
              : 'border-[#E1E9DD] bg-white text-[#374151]'
          "
          hover-class="none"
          @click="$emit('select-type', option.type)"
        >
          <text class="block font-semibold">{{ fertilizerLabel(option.type) }}</text>
          <text class="mt-1 block leading-4 text-[#667085]">{{ option.cell.displayText }}</text>
        </button>
      </view>
    </view>

    <view v-if="!options.length" class="mt-3 rounded-xl bg-[#FFF7DF] p-3">
      <text class="text-xs leading-5 text-[#8A5A00]">本月没有可用于设置提醒的固定施肥周期。</text>
    </view>

    <view
      v-if="hasVisiblePreflight"
      id="fertilization-reminder-preflight"
      class="mt-3 rounded-xl bg-white p-3"
    >
      <view
        v-if="preflight.requiresFertilizerTypeChangeAcknowledgement"
        class="mt-2 rounded-lg bg-[#FFF7DF] p-2.5"
      >
        <text class="block text-[11px] leading-4 text-[#8A5A00]">
          最近一次真实施肥记录使用的是{{
            fertilizerLabel(preflight.latestFertilizerType)
          }}，本次选择的是{{
            fertilizerLabel(preflight.selectedFertilizerType)
          }}。系统仍按最近一次施肥日期计算，请确认更换肥料类型。
        </text>
        <checkbox-group
          id="fertilization-reminder-fertilizer-type-change-group"
          class="mt-2"
          @change="$emit('change-type-change', $event)"
        >
          <label class="flex items-center gap-2">
            <checkbox
              id="fertilization-reminder-fertilizer-type-change-ack"
              value="confirmed"
              :checked="fertilizerTypeChangeAcknowledged"
              color="#2D7A4F"
            />
            <text class="text-xs text-[#53645A]">我确认这次更换肥料类型</text>
          </label>
        </checkbox-group>
      </view>

      <view
        v-for="requirement in visibleConditionRequirements"
        :key="requirement.code"
        class="mt-3"
      >
        <text class="block text-xs leading-5 text-[#53645A]">{{ requirement.prompt }}</text>
        <view class="mt-2 grid grid-cols-2 gap-2">
          <button
            :id="`fertilization-reminder-condition-${requirement.code}-yes`"
            class="m-0 rounded-lg border px-2 py-2 text-xs after:border-0"
            :class="
              conditionAnswers[requirement.code] === true
                ? 'border-[#2D7A4F] bg-[#E8F5E9] text-[#2D7A4F]'
                : 'border-[#E1E9DD] bg-white text-[#53645A]'
            "
            hover-class="none"
            @click="$emit('change-condition', { code: requirement.code, value: true })"
          >
            {{ isGrowthCondition(requirement.code) ? '继续设置' : '是' }}
          </button>
          <button
            :id="`fertilization-reminder-condition-${requirement.code}-no`"
            class="m-0 rounded-lg border px-2 py-2 text-xs after:border-0"
            :class="
              conditionAnswers[requirement.code] === false
                ? 'border-[#2D7A4F] bg-[#E8F5E9] text-[#2D7A4F]'
                : 'border-[#E1E9DD] bg-white text-[#53645A]'
            "
            hover-class="none"
            @click="$emit('change-condition', { code: requirement.code, value: false })"
          >
            {{ isGrowthCondition(requirement.code) ? '本次不设置' : '否' }}
          </button>
        </view>
      </view>
    </view>

    <text
      v-if="syncError"
      id="fertilization-reminder-sync-error"
      class="mt-3 block rounded-lg bg-[#FFF7DF] px-3 py-2 text-xs leading-5 text-[#8A5A00]"
    >
      {{ syncError }}
    </text>

    <button
      id="fertilization-reminder-preview-button"
      class="mt-3 m-0 w-full rounded-xl bg-[#2D7A4F] py-3 text-sm font-semibold text-white after:border-0 disabled:bg-gray-300"
      hover-class="none"
      :disabled="loading || !canPreview"
      @click="$emit('preview')"
    >
      {{ loading ? '正在计算…' : previewButtonText }}
    </button>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { fertilizerLabel } from './fertilization-reminder-options.js'

const props = defineProps({
  options: { type: Array, default: () => [] },
  selectedType: { type: String, default: '' },
  loading: { type: Boolean, default: false },
  canPreview: { type: Boolean, default: false },
  preflight: { type: Object, default: null },
  syncError: { type: String, default: '' },
  conditionAnswers: { type: Object, default: () => ({}) },
  fertilizerTypeChangeAcknowledged: { type: Boolean, default: false },
  previewButtonText: { type: String, default: '设置下次施肥提醒' }
})

const visibleConditionRequirements = computed(() =>
  (props.preflight?.conditionRequirements || []).filter(
    requirement => !isGrowthCondition(requirement.code)
  )
)
const hasVisiblePreflight = computed(
  () =>
    Boolean(props.preflight?.requiresFertilizerTypeChangeAcknowledgement) ||
    visibleConditionRequirements.value.length > 0
)

defineEmits(['select-type', 'preview', 'change-condition', 'change-type-change'])

function isGrowthCondition(code) {
  return ['active_growth', 'new_leaves_or_shoots'].includes(String(code || '').trim())
}
</script>
