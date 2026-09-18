<template>
  <view>
    <view class="px-4 py-4">
      <text class="block text-lg font-bold text-gray-900 mb-3">📅 今日提醒</text>
      <view v-if="loadingPlants" class="bg-white rounded-2xl p-6 text-center">
        <text class="block text-sm text-gray-600">正在加载养护任务...</text>
      </view>
      <view v-else-if="todayTasks.length === 0" class="bg-white rounded-2xl p-6 text-center">
        <text class="block text-4xl mb-2">✨</text>
        <text class="block text-sm text-gray-600">今天没有养护任务</text>
      </view>
      <view
        v-for="task in todayTasks"
        :key="task.id"
        class="bg-white rounded-2xl p-4 mb-3 shadow-sm"
      >
        <view class="flex items-center justify-between mb-3">
          <view class="flex-1">
            <text class="block text-base font-semibold text-gray-900 mb-1">{{
              task.plantName
            }}</text>
            <text class="block text-sm text-gray-600">{{ task.location }}</text>
          </view>
          <view class="bg-[#D8F3DC] px-3 py-1 rounded-full">
            <text class="text-xs text-primary font-medium">待完成</text>
          </view>
        </view>
        <view class="flex gap-2">
          <view class="flex-1 bg-gray-50 rounded-xl p-2 text-center">
            <text class="block text-lg mb-1">{{ getTaskIcon(task.type) }}</text>
            <text class="block text-xs text-gray-700">{{ getTaskName(task.type) }}</text>
          </view>
        </view>
        <view class="flex gap-2 mt-3">
          <button
            :id="`calendar-task-complete-${task.plantId}`"
            class="flex-1 bg-primary text-white text-sm py-2 rounded-xl"
            :disabled="task.saving"
            @click="$emit('complete', task.plantId)"
          >
            {{ task.saving ? '保存中...' : '完成' }}
          </button>
          <button
            :id="`calendar-task-postpone-${task.plantId}`"
            class="flex-1 bg-gray-100 text-gray-700 text-sm py-2 rounded-xl"
            :disabled="task.saving"
            @click="$emit('postpone', task.plantId)"
          >
            推迟
          </button>
        </view>
      </view>
    </view>

    <view v-if="undoableTasks.length" class="px-4 pb-4">
      <view class="rounded-2xl border border-[#d7e6dc] bg-[#f8faf9] p-4">
        <text class="block text-sm font-semibold text-[#2d7a4f]">最近操作</text>
        <text class="mt-1 block text-xs text-gray-600"
          >如需恢复刚才的日历操作，可以在这里撤销。</text
        >
        <view
          v-for="item in undoableTasks"
          :key="item.plantId"
          class="mt-3 flex items-center justify-between rounded-xl bg-white p-3"
        >
          <text class="text-sm text-gray-700">{{ item.plantName }}：{{ item.actionLabel }}</text>
          <button
            :id="`calendar-task-undo-${item.plantId}`"
            class="m-0 rounded-lg bg-white px-3 py-1.5 text-xs text-primary after:border-0"
            :disabled="Boolean(actionState[item.plantId])"
            @click="$emit('undo', item.plantId)"
          >
            {{ actionState[item.plantId] ? '恢复中...' : '撤销' }}
          </button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { getTaskIcon, getTaskName } from './calendar-helpers.js'

defineProps({
  loadingPlants: { type: Boolean, default: false },
  todayTasks: { type: Array, default: () => [] },
  undoableTasks: { type: Array, default: () => [] },
  actionState: { type: Object, default: () => ({}) }
})

defineEmits(['complete', 'postpone', 'undo'])
</script>

<style scoped>
/* 使用 Tailwind CSS */
</style>
