<template>
  <view
    class="relative block w-full"
    :class="thumbnail ? 'airflow-scene--thumbnail h-full' : ''"
    :style="thumbnail ? undefined : { aspectRatio: sceneAspectRatio }"
  >
    <image
      :src="baseScene"
      class="airflow-base-layer absolute inset-0 block h-full w-full"
      :mode="imageMode"
    />
    <image
      v-if="showPlant"
      :src="plantScene"
      class="airflow-plant-layer absolute inset-0 block h-full w-full"
      :class="plantClass"
      :mode="imageMode"
    />
    <image
      v-if="isMotionScene"
      :src="flowScene"
      class="airflow-flow-layer absolute inset-0 block h-full w-full"
      :class="[motionClass, profileClass]"
      :mode="imageMode"
    />
    <image
      v-if="showFanBase"
      :src="fanBaseScene"
      class="airflow-fan-base-layer absolute inset-0 block h-full w-full"
      :mode="imageMode"
    />
    <image
      v-if="showFan"
      :src="fanBladeScene"
      class="airflow-fan-blade-layer absolute inset-0 block h-full w-full"
      :class="fanClass"
      :style="{ transformOrigin: fanTransformOrigin }"
      :mode="imageMode"
    />
    <view v-if="showBreathDots" class="airflow-breath-layer absolute inset-0" :class="breathClass">
      <view class="airflow-breath-dot airflow-breath-dot--one" />
      <view class="airflow-breath-dot airflow-breath-dot--two" />
      <view class="airflow-breath-dot airflow-breath-dot--three" />
    </view>
    <view v-if="showQuestion" class="airflow-question-badge absolute" :class="questionClass">
      ?
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import windowDoubleBaseScene from '@/assets/airflow/scene-window-double-base.svg'
import windowSingleBaseScene from '@/assets/airflow/scene-window-single-base.svg'
import windowClosedScene from '@/assets/airflow/scene-window-closed.svg'
import freshAirScene from '@/assets/airflow/scene-fresh-air.svg'
import closedScene from '@/assets/airflow/scene-closed.svg'
import windowSingleFlowScene from '@/assets/airflow/scene-window-single-flow.svg'
import windowDoubleFlowScene from '@/assets/airflow/scene-window-double-flow.svg'
import freshAirFlowScene from '@/assets/airflow/scene-fresh-air-flow.svg'
import q5CanopyOpenBaseScene from '@/assets/airflow/scene-q5-canopy-open-base.svg'
import q5CanopyPartialBaseScene from '@/assets/airflow/scene-q5-canopy-partial-base.svg'
import q5CanopyEnclosedBaseScene from '@/assets/airflow/scene-q5-canopy-enclosed-base.svg'
import q5CanopyUnknownBaseScene from '@/assets/airflow/scene-q5-canopy-unknown-base.svg'
import q5DeviceBaseScene from '@/assets/airflow/scene-q5-device-base.svg'
import q5CanopyOpenFlowScene from '@/assets/airflow/scene-q5-canopy-open-flow.svg'
import q5CanopyPartialFlowScene from '@/assets/airflow/scene-q5-canopy-partial-flow.svg'
import q5DeviceCirculatingFlowScene from '@/assets/airflow/scene-q5-device-circulating-flow.svg'
import q5DeviceDirectFlowScene from '@/assets/airflow/scene-q5-device-direct-flow.svg'
import q5DeviceUnknownFlowScene from '@/assets/airflow/scene-q5-device-unknown-flow.svg'
import q5CanopyPlantScene from '@/assets/airflow/scene-q5-canopy-plant.svg'
import q5CanopyUnknownPlantScene from '@/assets/airflow/scene-q5-canopy-unknown-plant.svg'
import q5DevicePlantScene from '@/assets/airflow/scene-q5-device-plant.svg'
import q5DeviceDirectPlantScene from '@/assets/airflow/scene-q5-device-direct-plant.svg'
import q5FanNoneBaseScene from '@/assets/airflow/scene-q5-fan-none-base.svg'
import q5FanNoneBladeScene from '@/assets/airflow/scene-q5-fan-none-blades.svg'
import q5FanCirculatingBaseScene from '@/assets/airflow/scene-q5-fan-circulating-base.svg'
import q5FanCirculatingBladeScene from '@/assets/airflow/scene-q5-fan-circulating-blades.svg'
import q5FanDirectBaseScene from '@/assets/airflow/scene-q5-fan-direct-base.svg'
import q5FanDirectBladeScene from '@/assets/airflow/scene-q5-fan-direct-blades.svg'
import q5FanUnknownBaseScene from '@/assets/airflow/scene-q5-fan-unknown-base.svg'
import q5FanUnknownBladeScene from '@/assets/airflow/scene-q5-fan-unknown-blades.svg'

const props = defineProps({
  scene: {
    type: String,
    default: 'closed',
    validator: v => ['window-one', 'window-two', 'window-closed', 'fresh-air', 'closed'].includes(v)
  },
  motionProfile: {
    type: String,
    default: '',
    validator: v =>
      [
        '',
        'canopy-open',
        'canopy-partial',
        'canopy-enclosed',
        'canopy-unknown',
        'device-none',
        'device-circulating',
        'device-direct',
        'device-unknown'
      ].includes(v)
  },
  thumbnail: { type: Boolean, default: false },
  thumbnailAspectRatio: { type: Number, default: null }
})

const SCENE_MAP = {
  'window-two': windowDoubleBaseScene,
  'window-one': windowSingleBaseScene,
  'window-closed': windowClosedScene,
  'fresh-air': freshAirScene,
  'q5-canopy-open': q5CanopyOpenBaseScene,
  'q5-canopy-partial': q5CanopyPartialBaseScene,
  'q5-canopy-enclosed': q5CanopyEnclosedBaseScene,
  'q5-canopy-unknown': q5CanopyUnknownBaseScene,
  'q5-device': q5DeviceBaseScene,
  closed: closedScene
}

const WINDOW_SCENE_WIDTH = 340.123
const WINDOW_SCENE_HEIGHT = 107.691
const CLOSED_SCENE_WIDTH = 151.029
const CLOSED_SCENE_HEIGHT = 84.384
const Q5_SCENE_WIDTH = 104
const Q5_SCENE_HEIGHT = 72
const WINDOW_SCENE_ASPECT_RATIO = WINDOW_SCENE_WIDTH / WINDOW_SCENE_HEIGHT
const CLOSED_SCENE_ASPECT_RATIO = CLOSED_SCENE_WIDTH / CLOSED_SCENE_HEIGHT
const Q5_SCENE_ASPECT_RATIO = Q5_SCENE_WIDTH / Q5_SCENE_HEIGHT
const FAN_NONE_CENTER_X = 20
const FAN_CENTER_X = 18
const FAN_CENTER_Y = 26
const FAN_DIRECT_CENTER_Y = 30
const NORMALIZED_VIEWPORT_HEIGHT = 1
const HALF = 2
const MIN_ASPECT_RATIO = 0
const MIN_RENDERED_SIZE = 1
const PERCENT = 100
const FAN_ORIGIN_PRECISION = 4
const FLOW_SCENE_MAP = {
  'window-one': windowSingleFlowScene,
  'window-two': windowDoubleFlowScene,
  'fresh-air': freshAirFlowScene
}

const MOTION_PROFILE_MAP = {
  'canopy-open': {
    baseScene: 'q5-canopy-open',
    flowScene: q5CanopyOpenFlowScene,
    plantScene: q5CanopyPlantScene,
    flowClass: 'airflow-profile--canopy-open',
    plantClass: 'airflow-plant-layer--gentle',
    aspectRatio: Q5_SCENE_ASPECT_RATIO
  },
  'canopy-partial': {
    baseScene: 'q5-canopy-partial',
    flowScene: q5CanopyPartialFlowScene,
    plantScene: q5CanopyPlantScene,
    flowClass: 'airflow-profile--canopy-partial',
    plantClass: 'airflow-plant-layer--gentle',
    breathClass: 'airflow-breath-layer--canopy-partial',
    aspectRatio: Q5_SCENE_ASPECT_RATIO
  },
  'canopy-enclosed': {
    baseScene: 'q5-canopy-enclosed',
    plantScene: q5CanopyPlantScene,
    plantClass: 'airflow-plant-layer--static',
    breathClass: 'airflow-breath-layer--canopy-enclosed',
    aspectRatio: Q5_SCENE_ASPECT_RATIO
  },
  'canopy-unknown': {
    baseScene: 'q5-canopy-unknown',
    plantScene: q5CanopyUnknownPlantScene,
    plantClass: 'airflow-plant-layer--static',
    questionClass: 'airflow-question-badge--canopy-unknown',
    aspectRatio: Q5_SCENE_ASPECT_RATIO
  },
  'device-none': {
    baseScene: 'q5-device',
    plantScene: q5DevicePlantScene,
    fanBaseScene: q5FanNoneBaseScene,
    fanBladeScene: q5FanNoneBladeScene,
    fanClass: 'airflow-fan-blade-layer--none',
    plantClass: 'airflow-plant-layer--gentle airflow-plant-layer--device',
    breathClass: 'airflow-breath-layer--device-none',
    aspectRatio: Q5_SCENE_ASPECT_RATIO
  },
  'device-circulating': {
    baseScene: 'q5-device',
    flowScene: q5DeviceCirculatingFlowScene,
    plantScene: q5DevicePlantScene,
    fanBaseScene: q5FanCirculatingBaseScene,
    fanBladeScene: q5FanCirculatingBladeScene,
    fanClass: 'airflow-fan-blade-layer--circulating',
    plantClass: 'airflow-plant-layer--gentle airflow-plant-layer--device',
    flowClass: 'airflow-profile--device-circulating',
    aspectRatio: Q5_SCENE_ASPECT_RATIO
  },
  'device-direct': {
    baseScene: 'q5-device',
    flowScene: q5DeviceDirectFlowScene,
    plantScene: q5DeviceDirectPlantScene,
    fanBaseScene: q5FanDirectBaseScene,
    fanBladeScene: q5FanDirectBladeScene,
    fanClass: 'airflow-fan-blade-layer--direct',
    plantClass: 'airflow-plant-layer--direct airflow-plant-layer--direct-device',
    flowClass: 'airflow-profile--device-direct',
    aspectRatio: Q5_SCENE_ASPECT_RATIO
  },
  'device-unknown': {
    baseScene: 'q5-device',
    flowScene: q5DeviceUnknownFlowScene,
    plantScene: q5DevicePlantScene,
    fanBaseScene: q5FanUnknownBaseScene,
    fanBladeScene: q5FanUnknownBladeScene,
    fanClass: 'airflow-fan-blade-layer--unknown',
    plantClass: 'airflow-plant-layer--static airflow-plant-layer--device',
    questionClass: 'airflow-question-badge--device-unknown',
    aspectRatio: Q5_SCENE_ASPECT_RATIO
  }
}

const imageMode = computed(() => (props.thumbnail ? 'aspectFill' : 'scaleToFill'))
const motionClass = computed(() => `airflow-flow-layer--${props.scene}`)
const profile = computed(() => MOTION_PROFILE_MAP[props.motionProfile] || null)
const isMotionScene = computed(() =>
  Boolean(profile.value?.flowScene || FLOW_SCENE_MAP[props.scene])
)
const profileClass = computed(() => profile.value?.flowClass || '')
const plantClass = computed(() => profile.value?.plantClass || '')
const fanClass = computed(() => profile.value?.fanClass || '')
const breathClass = computed(() => profile.value?.breathClass || '')
const questionClass = computed(() => profile.value?.questionClass || '')
const showPlant = computed(() => Boolean(profile.value?.plantScene))
const plantScene = computed(() => profile.value?.plantScene || '')
const showFanBase = computed(() => Boolean(profile.value?.fanBaseScene))
const fanBaseScene = computed(() => profile.value?.fanBaseScene || '')
const showFan = computed(() => Boolean(profile.value?.fanBladeScene))
const fanBladeScene = computed(() => profile.value?.fanBladeScene || '')
const showBreathDots = computed(() => Boolean(profile.value?.breathClass))
const showQuestion = computed(() => Boolean(profile.value?.questionClass))

const FAN_CENTER_BY_PROFILE = Object.freeze({
  'device-none': { x: FAN_NONE_CENTER_X / Q5_SCENE_WIDTH, y: FAN_CENTER_Y / Q5_SCENE_HEIGHT },
  'device-circulating': { x: FAN_CENTER_X / Q5_SCENE_WIDTH, y: FAN_CENTER_Y / Q5_SCENE_HEIGHT },
  'device-direct': {
    x: FAN_CENTER_X / Q5_SCENE_WIDTH,
    y: FAN_DIRECT_CENTER_Y / Q5_SCENE_HEIGHT
  },
  'device-unknown': { x: FAN_CENTER_X / Q5_SCENE_WIDTH, y: FAN_CENTER_Y / Q5_SCENE_HEIGHT }
})

const fanTransformOrigin = computed(() => {
  const center = FAN_CENTER_BY_PROFILE[props.motionProfile]
  const sourceAspectRatio = profile.value?.aspectRatio
  const targetAspectRatio = Number(props.thumbnailAspectRatio)

  if (
    !props.thumbnail ||
    !center ||
    !Number.isFinite(sourceAspectRatio) ||
    !Number.isFinite(targetAspectRatio) ||
    targetAspectRatio <= MIN_ASPECT_RATIO
  ) {
    return undefined
  }

  // aspectFill crops the rendered SVG before the CSS transform is applied.
  // Project the motor center into the visible viewport so the blade layer
  // rotates around the center that the user actually sees.
  const scale = Math.max(targetAspectRatio / sourceAspectRatio, MIN_RENDERED_SIZE)
  const renderedWidth = sourceAspectRatio * scale
  const renderedHeight = scale
  const cropX = (renderedWidth - targetAspectRatio) / HALF
  const cropY = (renderedHeight - NORMALIZED_VIEWPORT_HEIGHT) / HALF
  const x = ((center.x * renderedWidth - cropX) / targetAspectRatio) * PERCENT
  const y = (center.y * renderedHeight - cropY) * PERCENT

  return `${x.toFixed(FAN_ORIGIN_PRECISION)}% ${y.toFixed(FAN_ORIGIN_PRECISION)}%`
})

const sceneAspectRatio = computed(
  () =>
    profile.value?.aspectRatio ||
    (props.scene === 'closed' ? CLOSED_SCENE_ASPECT_RATIO : WINDOW_SCENE_ASPECT_RATIO)
)

const baseScene = computed(() => SCENE_MAP[profile.value?.baseScene || props.scene] || closedScene)
const flowScene = computed(() => profile.value?.flowScene || FLOW_SCENE_MAP[props.scene] || '')
</script>

<style scoped>
.airflow-flow-layer {
  transform-origin: center;
  animation-duration: 1.6s;
  animation-iteration-count: infinite;
  animation-timing-function: ease-in-out;
  animation-fill-mode: both;
  will-change: opacity, transform;
}

.airflow-flow-layer--window-one {
  animation-name: airflow-flow-pulse;
}

.airflow-flow-layer--window-two {
  animation-name: airflow-flow-slide;
  animation-timing-function: linear;
}

.airflow-flow-layer--fresh-air {
  animation-name: airflow-flow-pulse;
  animation-duration: 2.2s;
}

.airflow-plant-layer {
  transform-origin: 50% 75%;
  will-change: transform;
}

.airflow-plant-layer--device {
  transform-origin: 63.4615% 75%;
}

.airflow-plant-layer--direct-device {
  transform-origin: 65.3846% 75%;
}

.airflow-plant-layer--gentle {
  animation: airflow-plant-gentle 2.4s ease-in-out infinite;
}

.airflow-plant-layer--direct {
  animation: airflow-plant-direct 0.9s ease-in-out infinite;
}

.airflow-fan-base-layer,
.airflow-fan-blade-layer {
  pointer-events: none;
}

.airflow-fan-base-layer {
  z-index: 2;
}

.airflow-fan-blade-layer {
  z-index: 3;
  transform-origin: 17.3077% 36.1111%;
  will-change: transform;
}

.airflow-fan-blade-layer--none {
  transform-origin: 19.2308% 36.1111%;
  animation: airflow-fan-spin 6s linear infinite;
}

.airflow-fan-blade-layer--circulating {
  animation: airflow-fan-spin 0.8s linear infinite;
}

.airflow-fan-blade-layer--direct {
  transform-origin: 17.3077% 41.6667%;
  animation: airflow-fan-spin 0.45s linear infinite;
}

.airflow-fan-blade-layer--unknown {
  animation: airflow-fan-spin 2.4s linear infinite;
}

.airflow-breath-layer {
  z-index: 3;
  pointer-events: none;
}

.airflow-breath-dot {
  position: absolute;
  width: 3.6538%;
  height: 5.2778%;
  border-radius: 999px;
  background: #5a7a68;
  transform: scale(1);
  animation-name: airflow-breath;
  animation-timing-function: ease-in-out;
  animation-iteration-count: infinite;
}

.airflow-breath-dot--one {
  left: calc(40.3846% - 1.8269%);
  top: calc(33.3333% - 2.6389%);
  opacity: 0.22;
  animation-duration: 3.2s;
}

.airflow-breath-dot--two {
  left: calc(77.8846% - 1.8269%);
  top: calc(55.5556% - 2.6389%);
  opacity: 0.18;
  animation-delay: 1s;
  animation-duration: 4s;
}

.airflow-breath-dot--three {
  left: calc(60.5769% - 1.8269%);
  top: calc(19.4444% - 2.6389%);
  opacity: 0.2;
  animation-delay: 0.5s;
  animation-duration: 3.6s;
}

.airflow-breath-layer--canopy-partial .airflow-breath-dot--one {
  left: calc(11.5385% - 1.8269%);
  top: calc(33.3333% - 2.6389%);
}

.airflow-breath-layer--canopy-partial .airflow-breath-dot--two {
  left: calc(50.9615% - 1.8269%);
  top: calc(55.5556% - 2.6389%);
}

.airflow-breath-layer--canopy-partial .airflow-breath-dot--three {
  left: calc(33.6538% - 1.8269%);
  top: calc(19.4444% - 2.6389%);
}

.airflow-breath-layer--canopy-enclosed .airflow-breath-dot--one {
  left: calc(30.7692% - 1.8269%);
  top: calc(33.3333% - 2.6389%);
}

.airflow-breath-layer--canopy-enclosed .airflow-breath-dot--two {
  left: calc(70.1923% - 1.8269%);
  top: calc(55.5556% - 2.6389%);
}

.airflow-breath-layer--canopy-enclosed .airflow-breath-dot--three {
  left: calc(52.8846% - 1.8269%);
  top: calc(19.4444% - 2.6389%);
}

.airflow-question-badge {
  z-index: 4;
  display: flex;
  width: 18px;
  height: 18px;
  align-items: center;
  justify-content: center;
  border: 0.8px solid rgba(90, 122, 104, 0.28);
  border-radius: 999px;
  color: #5a7a68;
  background: #f1f8f4;
  font-size: 10px;
  line-height: 18px;
  transform: translate(-50%, -50%);
  animation: airflow-question 2.4s ease-in-out infinite;
}

.airflow-question-badge--canopy-unknown {
  left: 82.6923%;
  top: 36.1111%;
}

.airflow-question-badge--device-unknown {
  left: 84.6154%;
  top: 27.7778%;
}

.airflow-profile--canopy-open {
  animation-name: airflow-flow-pulse;
  animation-duration: 1.1s;
}

.airflow-profile--canopy-partial {
  animation-name: airflow-flow-pulse;
  animation-duration: 1.1s;
}

.airflow-profile--device-circulating {
  animation-name: airflow-flow-slide;
  animation-duration: 1.4s;
  animation-timing-function: linear;
}

.airflow-profile--device-direct {
  animation-name: airflow-flow-slide;
  animation-duration: 0.6s;
  animation-timing-function: linear;
}

.airflow-profile--device-unknown {
  animation-name: airflow-flow-pulse;
  animation-duration: 2s;
}

@keyframes airflow-flow-pulse {
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

@keyframes airflow-flow-slide {
  0% {
    opacity: 0.4;
    transform: translateX(-8px);
  }

  50% {
    opacity: 1;
    transform: translateX(0);
  }

  100% {
    opacity: 0.4;
    transform: translateX(8px);
  }
}

@keyframes airflow-plant-gentle {
  0%,
  100% {
    transform: rotate(0deg);
  }

  25% {
    transform: rotate(-2.5deg);
  }

  50% {
    transform: rotate(0deg);
  }

  75% {
    transform: rotate(1deg);
  }
}

@keyframes airflow-plant-direct {
  0%,
  100% {
    transform: rotate(0deg);
  }

  25% {
    transform: rotate(-7deg);
  }

  50% {
    transform: rotate(0deg);
  }

  75% {
    transform: rotate(2.8deg);
  }
}

@keyframes airflow-fan-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes airflow-breath {
  0%,
  100% {
    transform: scale(1);
  }

  50% {
    transform: scale(1.6);
  }
}

@keyframes airflow-question {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.45;
  }
}

@media (prefers-reduced-motion: reduce) {
  .airflow-plant-layer,
  .airflow-flow-layer,
  .airflow-fan-blade-layer,
  .airflow-breath-dot,
  .airflow-question-badge {
    animation: none;
  }
}
</style>
