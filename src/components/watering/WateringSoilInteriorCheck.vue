<template>
  <view id="watering-soil-interior-check" class="watering-soil-interior-check">
    <text class="watering-soil-interior-check__title">请进一步确认</text>
    <view class="watering-soil-interior-check__options">
      <view
        id="watering-soil-interior-choice-manual"
        class="watering-soil-interior-check__option"
        :class="{ 'watering-soil-interior-check__option--active': mode === 'manual' }"
        @click="selectMode('manual')"
      >
        <text>我已摸到超过盆深 1/3，确认盆土状态</text>
      </view>
      <view
        v-if="mode === 'manual'"
        class="watering-soil-interior-check__detail watering-soil-interior-check__manual-group"
      >
        <view class="watering-soil-interior-check__radios">
          <view
            v-for="item in soilStateOptions"
            :id="`watering-soil-interior-state-${item.value}`"
            :key="item.value"
            class="watering-soil-interior-check__radio"
            :class="{ 'watering-soil-interior-check__radio--active': interiorState === item.value }"
            @click="selectInteriorState(item.value)"
          >
            <text>{{ item.label }}</text>
          </view>
        </view>
      </view>
      <view
        id="watering-soil-interior-choice-history"
        class="watering-soil-interior-check__option"
        :class="{ 'watering-soil-interior-check__option--active': mode === 'history' }"
        @click="selectMode('history')"
      >
        <text>填写过往 10 天的浇水情况</text>
      </view>
      <view
        id="watering-soil-interior-choice-skip"
        class="watering-soil-interior-check__option"
        :class="{ 'watering-soil-interior-check__option--active': mode === 'skip' }"
        @click="selectMode('skip')"
      >
        <text>跳过以上操作，按盆土里面也干处理</text>
      </view>
    </view>

    <view v-if="mode === 'history'" class="watering-soil-interior-check__detail">
      <!--     这里是我删掉,ai不准改-->
      <CareBehaviorTimeline
        id-prefix="watering-soil-interior-history"
        :timeline="timeline"
        :environment-weather-window="props.environmentWeatherWindow"
        :enable-dose-per-date="true"
        @change="handleTimelineChange"
      />
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import CareBehaviorTimeline from '@/components/CareBehaviorTimeline.vue'
import { todayStr } from '@/pages/index/components/watering-reminder-options.js'

const props = defineProps({
  environmentWeatherWindow: { type: Object, default: null }
})
const emit = defineEmits(['change'])
const mode = ref('')
const interiorState = ref('')
const wateringEvents = ref([])
const soilStateOptions = [
  { value: 'wet', label: '盆土很湿' },
  { value: 'moist', label: '盆土有点湿' },
  { value: 'dry', label: '盆土干' }
]

const timeline = { reference_date: todayStr(), watering_events_10d: [] }

function emitChange() {
  emit('change', {
    mode: mode.value,
    interiorState: interiorState.value,
    wateringEvents: wateringEvents.value,
    hasWateringHistoryInput: mode.value === 'history'
  })
}

function selectMode(nextMode) {
  mode.value = nextMode
  if (nextMode !== 'manual') {
    interiorState.value = ''
  }
  emitChange()
}

function selectInteriorState(nextState) {
  interiorState.value = nextState
  emitChange()
}

function handleTimelineChange(payload) {
  wateringEvents.value = Array.isArray(payload?.watering_events_10d)
    ? payload.watering_events_10d
    : []
  emitChange()
}
</script>

<style scoped>
.watering-soil-interior-check {
  margin-top: 14px;
  padding: 12px;
  border: 1px solid #d6e6da;
  border-radius: 14px;
}
.watering-soil-interior-check__title {
  display: block;
  color: #264738;
  font-size: 14px;
  font-weight: 700;
}
.watering-soil-interior-check__options {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
}
.watering-soil-interior-check__option,
.watering-soil-interior-check__radio {
  border: 1px solid #d6e6da;
  border-radius: 10px;
  padding: 10px;
  color: #375548;
  font-size: 13px;
  line-height: 20px;
}
.watering-soil-interior-check__option--active,
.watering-soil-interior-check__radio--active {
  border-color: #2d7a4f;
  background: #eef8f0;
  color: #1e6540;
  font-weight: 700;
}
.watering-soil-interior-check__detail {
  margin-top: 12px;
}
.watering-soil-interior-check__manual-group {
  margin-top: 0;
}
.watering-soil-interior-check__hint {
  display: block;
  margin-bottom: 8px;
  color: #5a7868;
  font-size: 12px;
  line-height: 18px;
}
.watering-soil-interior-check__detail-title {
  display: block;
  margin-bottom: 4px;
  color: #264738;
  font-size: 13px;
  font-weight: 700;
  line-height: 18px;
}
.watering-soil-interior-check__radios {
  display: flex;
  gap: 8px;
}
.watering-soil-interior-check__radio {
  flex: 1;
  text-align: center;
}
</style>
