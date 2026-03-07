<template>
  <view>
    <!-- 植物照片 -->
    <view class="mb-6">
      <text class="block text-sm font-semibold text-gray-800 mb-3">植物照片</text>
      <view class="w-[120px] h-[120px] rounded-2xl overflow-hidden" @click="$emit('upload-photo')">
        <image v-if="modelValue.image" :src="modelValue.image" class="w-full h-full" mode="aspectFill" />
        <view v-else class="w-full h-full bg-gray-100 border-2 border-dashed border-gray-300 rounded-2xl flex flex-col items-center justify-center">
          <text class="text-[32px] mb-2">📷</text>
          <text class="text-xs text-gray-400">添加照片</text>
        </view>
      </view>
    </view>

    <!-- 植物昵称 -->
    <view class="mb-6">
      <text class="block text-sm font-semibold text-gray-800 mb-3">植物昵称 <text class="font-normal text-gray-400">(可选)</text></text>
      <input
        :value="modelValue.nickname"
        @input="update('nickname', $event.detail.value)"
        class="w-full py-3 px-4 bg-white border border-gray-300 rounded-xl text-sm"
        placeholder="给它起个名字吧"
        placeholder-class="text-gray-300"
      />
    </view>

    <!-- 摆放位置 -->
    <view class="mb-6">
      <text class="block text-sm font-semibold text-gray-800 mb-3">摆放位置</text>
      <view class="flex flex-wrap gap-2">
        <view
          v-for="loc in locations"
          :key="loc"
          class="py-2 px-4 bg-white border rounded-[20px] transition-all duration-300"
          :class="modelValue.location === loc ? 'bg-primary border-primary' : 'border-gray-300'"
          @click="update('location', loc)"
        >
          <text class="text-sm" :class="modelValue.location === loc ? 'text-white' : 'text-gray-600'">{{ loc }}</text>
        </view>
      </view>
    </view>

    <!-- 种植日期 -->
    <view class="mb-6">
      <text class="block text-sm font-semibold text-gray-800 mb-3">种植日期</text>
      <picker mode="date" :value="modelValue.plantDate" @change="update('plantDate', $event.detail.value)">
        <view class="flex items-center justify-between py-3 px-4 bg-white border border-gray-300 rounded-xl">
          <text class="text-sm text-gray-800">{{ modelValue.plantDate || '选择日期' }}</text>
          <text class="text-lg text-gray-400">›</text>
        </view>
      </picker>
    </view>

    <!-- 备注 -->
    <view class="mb-6">
      <text class="block text-sm font-semibold text-gray-800 mb-3">备注 <text class="font-normal text-gray-400">(可选)</text></text>
      <textarea
        :value="modelValue.notes"
        @input="update('notes', $event.detail.value)"
        class="w-full min-h-[100px] py-3 px-4 bg-white border border-gray-300 rounded-xl text-sm"
        placeholder="记录一些特别的信息..."
        placeholder-class="text-gray-300"
        maxlength="200"
      />
      <text class="block text-right text-xs text-gray-400 mt-2">{{ modelValue.notes.length }}/200</text>
    </view>
  </view>
</template>

<script setup>
const props = defineProps({
  modelValue: { type: Object, required: true }
})
const emit = defineEmits(['update:modelValue', 'upload-photo'])

const locations = ['阳台', '客厅', '卧室', '书房', '办公室', '其他']

function update(key, value) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}
</script>
