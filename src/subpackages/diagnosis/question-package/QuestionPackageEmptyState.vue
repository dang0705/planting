<template>
  <view id="diagnose-question-package-empty-state" class="box-border min-h-screen px-4 py-7">
    <text class="block text-[17px] font-extrabold text-gray-900">暂时没有需要继续回答的问题</text>
    <text class="mt-2 block text-xs leading-relaxed text-gray-500">
      如果刚完成视觉诊断，请返回上一页重新进入问诊。
    </text>
    <button
      id="diagnose-question-package-back-button"
      class="mt-5 h-[48px] rounded-xl bg-[#2d7a4f] p-0 text-[14px] font-bold leading-[48px] text-white"
      @click="$emit('back')"
    >
      返回上一页
    </button>
  </view>
</template>
