<template>
  <view
    class="flex items-center gap-3 rounded-[12px] border p-3"
    :class="
      selected
        ? 'border-[#2d7a4f] bg-[#e8f3ea]'
        : 'border-[rgba(45,122,79,0.15)] bg-white'
    "
    @click="$emit('select', plant)"
  >
    <!-- 图片区（提取自首页 PlantCard 左栏，纯展示无点击跳转） -->
    <view
      class="h-[56px] w-[56px] flex-[0_0_56px] overflow-hidden rounded-lg bg-[#f1f8f4]"
    >
      <image v-if="plant.image" :src="plant.image" class="h-full w-full" mode="aspectFill" />
      <view v-else class="relative h-full w-full bg-[#f1f8f4]">
        <view
          class="absolute left-1/2 top-1/2 h-[28px] w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#2d7a4f]"
        />
        <view
          class="absolute left-1/2 top-1/2 h-[10px] w-[14px] -translate-x-[80%] -translate-y-1/2 rotate-[-22deg] rounded-[999px_0_999px_0] bg-[#2d7a4f]"
        />
        <view
          class="absolute left-1/2 top-1/2 h-[10px] w-[14px] translate-x-[20%] -translate-y-1/2 rotate-[22deg] scale-x-[-1] rounded-[999px_0_999px_0] bg-[#2d7a4f]"
        />
      </view>
    </view>

    <!-- 名称区（提取自首页 PlantCard 中栏首行，纯展示无完整度圆环） -->
    <view class="min-w-0 flex-1">
      <text class="block overflow-hidden text-ellipsis whitespace-nowrap text-[15px] font-medium text-[#0a0a0a]">
        {{ plant.displayName || '未命名植物' }}
      </text>
      <text v-if="plant.canonicalName || plant.genus" class="mt-0.5 block text-[12px] text-[#9ca3af]">
        {{ plant.canonicalName || plant.genus }}
      </text>
    </view>

    <!-- 选中指示器 -->
    <text v-if="selected" class="text-[18px] text-[#2d7a4f]">✓</text>
  </view>
</template>

<script setup>
defineProps({
  plant: { type: Object, required: true },
  selected: { type: Boolean, default: false }
})

defineEmits(['select'])
</script>
