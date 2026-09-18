<template>
  <view
    v-if="resultText || actionText"
    id="watering-soil-visual-decision"
    class="watering-soil-visual-decision"
  >
    <view class="watering-soil-visual-decision__section">
      <text class="watering-soil-visual-decision__label">{{ resultLabel }}</text>
      <text class="watering-soil-visual-decision__text">{{ resultText }}</text>
    </view>
    <view
      v-if="actionText"
      class="watering-soil-visual-decision__section watering-soil-visual-decision__section--action"
    >
      <text class="watering-soil-visual-decision__label">{{ actionLabel }}</text>
      <text class="watering-soil-visual-decision__text">{{ actionText }}</text>
    </view>
  </view>
</template>

<script setup>
defineProps({
  resultText: { type: String, default: '' },
  actionText: { type: String, default: '' },
  resultLabel: { type: String, default: '盆土视觉结果' },
  actionLabel: { type: String, default: '本次行动' }
})
</script>

<style scoped>
.watering-soil-visual-decision {
  margin: 0;
  padding: 16px;
  border: 1px solid #d7e6dc;
  border-radius: 20px;
  background: #f3faf5;
  box-shadow: 0 2px 10px rgba(45, 122, 79, 0.04);
}
.watering-soil-visual-decision__section + .watering-soil-visual-decision__section {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #e2eee5;
}
.watering-soil-visual-decision__label {
  display: block;
  color: #5a7868;
  font-size: 11px;
  line-height: 16px;
}
.watering-soil-visual-decision__text {
  display: block;
  margin-top: 3px;
  color: #254737;
  font-size: 13px;
  font-weight: 600;
  line-height: 20px;
}
.watering-soil-visual-decision__section--action .watering-soil-visual-decision__text {
  color: #1f6a45;
}
</style>
