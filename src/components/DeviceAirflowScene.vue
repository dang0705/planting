<template>
  <view class="relative block h-full w-full overflow-hidden">
    <image
      :src="groundScene"
      class="device-airflow-layer absolute inset-0 block h-full w-full"
      mode="scaleToFill"
    />

    <view
      v-if="fanRelation"
      class="device-airflow-source device-airflow-source--fan absolute inset-0"
    >
      <image
        :src="fanBaseScene"
        class="device-airflow-layer absolute inset-0 block h-full w-full"
        mode="scaleToFill"
      />
      <image
        :src="fanBladeScene"
        class="device-airflow-fan-blades absolute inset-0 block h-full w-full"
        :class="fanRelation === 'direct' ? 'device-airflow-fan-blades--direct' : ''"
        mode="scaleToFill"
      />
    </view>
    <view
      v-if="airConditionerRelation"
      class="device-airflow-source device-airflow-source--air-conditioner absolute inset-0"
    >
      <image
        :src="airConditionerBaseScene"
        class="device-airflow-layer absolute inset-0 block h-full w-full"
        mode="scaleToFill"
      />
    </view>
    <view
      v-if="freshAirRelation"
      class="device-airflow-source device-airflow-source--fresh-air absolute inset-0"
    >
      <image
        :src="freshAirSourceScene"
        class="device-airflow-layer absolute inset-0 block h-full w-full"
        mode="scaleToFill"
      />
    </view>

    <image
      v-if="fanRelation"
      :src="fanFlowScene"
      class="device-airflow-flow absolute inset-0 block h-full w-full"
      :class="fanRelation === 'direct' ? 'device-airflow-flow--direct' : ''"
      mode="scaleToFill"
    />
    <image
      v-if="airConditionerRelation"
      :src="airConditionerFlowScene"
      class="device-airflow-flow absolute inset-0 block h-full w-full"
      :class="airConditionerRelation === 'direct' ? 'device-airflow-flow--direct' : ''"
      mode="scaleToFill"
    />
    <image
      v-if="freshAirRelation"
      :src="freshAirFlowScene"
      class="device-airflow-flow device-airflow-flow--fresh-air absolute inset-0 block h-full w-full"
      mode="scaleToFill"
    />

    <image
      :src="plantScene"
      class="device-airflow-plant absolute inset-0 block h-full w-full"
      :class="plantMotionClass"
      mode="scaleToFill"
    />
  </view>
</template>

<script setup>
import { computed } from 'vue'
import airConditionerCirculatingFlowScene from '@/assets/airflow/scene-q5-air-conditioner-circulating-flow.svg'
import airConditionerDirectFlowScene from '@/assets/airflow/scene-q5-air-conditioner-direct-flow.svg'
import airConditionerBaseScene from '@/assets/airflow/scene-q5-air-conditioner-base.svg'
import airConditionerPlantScene from '@/assets/airflow/scene-q5-air-conditioner-plant.svg'
import freshAirDeviceFlowScene from '@/assets/airflow/scene-q5-fresh-air-circulating-flow.svg'
import freshAirDirectFlowScene from '@/assets/airflow/scene-q5-fresh-air-direct-flow.svg'
// Keep the exchange scene's flow structure and animation timing, with a thinner
// stroke and wider arced spread with offset outlets adapted for the taller device canvas.
import freshAirSourceScene from '@/assets/airflow/scene-q5-fresh-air-source.svg'
import groundScene from '@/assets/airflow/scene-q5-device-base.svg'
import fanCirculatingBaseScene from '@/assets/airflow/scene-q5-fan-circulating-base.svg'
import fanCirculatingBladeScene from '@/assets/airflow/scene-q5-fan-circulating-blades.svg'
import fanDirectBaseScene from '@/assets/airflow/scene-q5-fan-direct-base.svg'
import fanDirectBladeScene from '@/assets/airflow/scene-q5-fan-direct-blades.svg'
import fanCirculatingFlowScene from '@/assets/airflow/scene-q5-device-fan-circulating-flow.svg'
import fanDirectFlowScene from '@/assets/airflow/scene-q5-device-direct-flow.svg'

const props = defineProps({
  sources: { type: Array, default: () => [] }
})

const normalizedSources = computed(() =>
  props.sources.filter(
    source =>
      ['fan', 'air_conditioner', 'fresh_air'].includes(source?.key) &&
      ['circulating', 'direct'].includes(source?.relation)
  )
)

function sourceRelation(key) {
  return normalizedSources.value.find(source => source.key === key)?.relation || null
}

const fanRelation = computed(() => sourceRelation('fan'))
const airConditionerRelation = computed(() => sourceRelation('air_conditioner'))
const freshAirRelation = computed(() => sourceRelation('fresh_air'))
const hasDirectSource = computed(() =>
  normalizedSources.value.some(source => source.relation === 'direct')
)
const plantScene = airConditionerPlantScene
const plantMotionClass = computed(() =>
  hasDirectSource.value
    ? 'device-airflow-plant--direct'
    : normalizedSources.value.length
      ? 'device-airflow-plant--circulating'
      : ''
)

const fanBaseScene = computed(() =>
  fanRelation.value === 'direct' ? fanDirectBaseScene : fanCirculatingBaseScene
)
const fanBladeScene = computed(() =>
  fanRelation.value === 'direct' ? fanDirectBladeScene : fanCirculatingBladeScene
)
const fanFlowScene = computed(() =>
  fanRelation.value === 'direct' ? fanDirectFlowScene : fanCirculatingFlowScene
)
const freshAirFlowScene = computed(() =>
  freshAirRelation.value === 'direct' ? freshAirDirectFlowScene : freshAirDeviceFlowScene
)
const airConditionerFlowScene = computed(() =>
  airConditionerRelation.value === 'direct'
    ? airConditionerDirectFlowScene
    : airConditionerCirculatingFlowScene
)
</script>

<style scoped>
.device-airflow-layer,
.device-airflow-flow,
.device-airflow-plant,
.device-airflow-fan-blades,
.device-airflow-source {
  pointer-events: none;
}

.device-airflow-flow {
  transform-origin: center;
  animation: device-airflow-flow-slide 1.4s linear infinite;
  will-change: opacity, transform;
}

.device-airflow-flow--direct {
  animation-duration: 0.6s;
}

.device-airflow-flow--fresh-air {
  animation-name: device-airflow-flow-pulse;
  animation-duration: 2.4s;
  animation-iteration-count: infinite;
  animation-timing-function: ease-in-out;
  animation-fill-mode: both;
}

.device-airflow-plant {
  transform-origin: 50% 75%;
  will-change: transform;
}

.device-airflow-plant--circulating {
  animation: device-airflow-plant-gentle 2.4s ease-in-out infinite;
}

.device-airflow-plant--direct {
  animation: device-airflow-plant-direct 0.9s ease-in-out infinite;
}

.device-airflow-fan-blades {
  transform-origin: 13.8% 60.5%;
  animation: device-airflow-fan-spin 0.8s linear infinite;
  will-change: transform;
}

.device-airflow-fan-blades--direct {
  transform-origin: 13.8% 60.5%;
  animation-duration: 0.45s;
}

@keyframes device-airflow-flow-slide {
  0% {
    opacity: 0.4;
    transform: translateX(-4px);
  }

  50% {
    opacity: 1;
    transform: translateX(0);
  }

  100% {
    opacity: 0.4;
    transform: translateX(4px);
  }
}

@keyframes device-airflow-flow-pulse {
  0%,
  100% {
    opacity: 0.35;
    transform: translateX(-2px) scale(0.98);
  }

  50% {
    opacity: 1;
    transform: translateX(2px) scale(1);
  }
}

@keyframes device-airflow-plant-gentle {
  0%,
  100% {
    transform: rotate(0deg);
  }

  50% {
    transform: rotate(-2.5deg);
  }
}

@keyframes device-airflow-plant-direct {
  0%,
  100% {
    transform: rotate(0deg);
  }

  50% {
    transform: rotate(-7deg);
  }
}

@keyframes device-airflow-fan-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
