<template>
  <view>
    <view
      id="watering-reminder-last-watering-row"
      class="mt-2 flex items-center rounded-[14px] border border-[#e8efeb] bg-white p-4"
      @click="$emit('last-watering')"
    >
      <view class="flex size-11 items-center justify-center rounded-full bg-[#e8f5f0]">
        <image :src="waterDefaultIcon" class="size-5" mode="aspectFit" />
      </view>
      <view class="ml-3 flex-1">
        <text class="block text-[15px] font-semibold text-[#1d2a23]">上次浇水</text>
        <text class="mt-0.5 block text-[13px] text-[#5a7868]">{{ lastWateringText }}</text>
        <text v-if="lastWateringText === '尚无记录'" class="mt-0.5 block text-[11px] text-[#8a9690]">
          记得最近一次浇水日期吗？填一次就可以开始估算；记不清也可以先查看盆土。
        </text>
        <text v-else class="mt-0.5 block text-[11px] text-[#8a9690]">
          只记得最近一次也可以，更多记录可选
        </text>
      </view>
      <text class="text-[20px] text-[#8a9690]">›</text>
    </view>

    <view class="mt-2">
      <text class="text-[13px] font-semibold text-[#53645a]">让建议更贴近你的花盆</text>
      <view
        id="watering-reminder-pot-profile-row"
        class="mt-1.5 flex items-center rounded-[14px] border border-[#e1e9dd] p-3"
        @click="$emit('pot-profile')"
      >
        <view class="flex-1">
          <text class="block text-[14px] font-semibold text-[#1f2933]">盆形信息</text>
          <text class="mt-0.5 block text-[12px] text-[#718075]">{{ potProfileSummary }}</text>
        </view>
        <text class="text-[20px] text-[#94a39a]">›</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import waterDefaultIcon from '@/assets/icons/home-card-water-default.svg'

defineProps({
  lastWateringText: { type: String, default: '尚无记录' },
  potProfileSummary: { type: String, default: '' }
})

defineEmits(['last-watering', 'pot-profile'])
</script>
