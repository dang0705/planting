// 光照环境选择器常量与纯计算
// 从 LightEnvironmentPicker.vue 抽出的静态配置（方位按钮/位置选项）与纯函数
// （距离档位文本、距离系数、罗盘指针角度、方位箭头定位），便于单独测试与复用。

// 有窗选项（作为折叠面板标题项）
export const WINDOW_OPTION = { key: 'window', label: '有窗' }

// 无窗 / 补光灯普通单选项
export const NON_WINDOW_OPTIONS = [
  { key: 'no_window', label: '无窗' },
  { key: 'grow_light', label: '补光灯' }
]

// 4 主方位按钮（62px 圆形，对齐 Figma 220:62）
export const CARDINAL_DIRECTIONS = [
  { key: 'north', label: '北', arrowRotation: 0, layout: 'col', style: 'left:79px; top:-3px;' },
  { key: 'east', label: '东', arrowRotation: 90, layout: 'row', style: 'left:160px; top:79px;' },
  { key: 'south', label: '南', arrowRotation: 180, layout: 'col', style: 'left:79px; top:161px;' },
  { key: 'west', label: '西', arrowRotation: -90, layout: 'row', style: 'left:-2px; top:79px;' }
]

// 4 对角方位按钮（28px 圆形，对齐 Figma 220:62）
export const DIAGONAL_DIRECTIONS = [
  { key: 'north_east', arrowRotation: 45, style: 'left:162px; top:30px;' },
  { key: 'south_east', arrowRotation: 135, style: 'left:162px; top:162px;' },
  { key: 'south_west', arrowRotation: -135, style: 'left:30px; top:162px;' },
  { key: 'north_west', arrowRotation: -45, style: 'left:30px; top:30px;' }
]

export const POSITION_OPTIONS = [
  { key: 'window_side', label: '窗边' },
  { key: 'middle', label: '房间中部' },
  { key: 'deep', label: '房间深处' }
]

// 位置 → 默认距离映射（selectPosition 用）
export const POSITION_DEFAULT_DISTANCE = {
  window_side: 1,
  middle: 2.5,
  deep: 5
}

// 距离档位边界
const DISTANCE_WINDOW_SIDE_MAX = 1.2
const DISTANCE_MIDDLE_MAX = 3.5

// 距离系数公式参数
const DISTANCE_FACTOR_MID_SLOPE = 0.08
const DISTANCE_FACTOR_MID_MIN = 0.82
const DISTANCE_FACTOR_DEEP_SLOPE = 0.06
const DISTANCE_FACTOR_DEEP_MIN = 0.42
const DISTANCE_FACTOR_NEAR_BOUNDARY = 1
const DISTANCE_FACTOR_MID_BOUNDARY = 3

export function resolveDistanceBand(distance) {
  const value = Number(distance || 0)
  if (value <= DISTANCE_WINDOW_SIDE_MAX) {
    return '靠窗'
  }
  if (value <= DISTANCE_MIDDLE_MAX) {
    return '房间中部'
  }
  return '房间深处'
}

export function resolveDistancePosition(distance) {
  if (distance <= DISTANCE_WINDOW_SIDE_MAX) {
    return 'window_side'
  }
  if (distance <= DISTANCE_MIDDLE_MAX) {
    return 'middle'
  }
  return 'deep'
}

export function resolveDistanceFactor(value) {
  const distance = Number(value || 0)
  if (distance <= DISTANCE_FACTOR_NEAR_BOUNDARY) {
    return 1
  }
  if (distance <= DISTANCE_FACTOR_MID_BOUNDARY) {
    return Math.max(
      DISTANCE_FACTOR_MID_MIN,
      1 - (distance - DISTANCE_FACTOR_NEAR_BOUNDARY) * DISTANCE_FACTOR_MID_SLOPE
    )
  }
  return Math.max(
    DISTANCE_FACTOR_DEEP_MIN,
    DISTANCE_FACTOR_MID_MIN - (distance - DISTANCE_FACTOR_MID_BOUNDARY) * DISTANCE_FACTOR_DEEP_SLOPE
  )
}

// 校准弹框罗盘指针角度映射（facing → 罗盘角度），对齐 Figma 154:271
const COMPASS_FACING_ANGLE_MAP = {
  north: 270,
  north_east: 315,
  east: 0,
  south_east: 45,
  south: 90,
  south_west: 135,
  west: 180,
  north_west: 225
}

// Figma 指针默认 rotate(-116.8deg) 对应南向基准
const COMPASS_POINTER_BASE_ROTATION = -116.8
const COMPASS_SOUTH_ANGLE = 90

export function resolveCompassPointerStyle(facing) {
  const facingAngle = COMPASS_FACING_ANGLE_MAP[facing]
  if (facingAngle === undefined) {
    return `transform:translate(-50%, -50%) rotate(${COMPASS_POINTER_BASE_ROTATION}deg);transform-origin:center;`
  }
  // 指针默认指向南（基准），按 facing 相对南的偏移旋转
  const offset = facingAngle - COMPASS_SOUTH_ANGLE
  const rotation = COMPASS_POINTER_BASE_ROTATION + offset
  return `transform:translate(-50%, -50%) rotate(${rotation.toFixed(1)}deg);transform-origin:center;`
}

// 方位箭头定位（选中方向指示），对齐 Figma 220:62
const DIRECTION_ARROW_ANGLE_MAP = {
  east: 0,
  south_east: 45,
  south: 90,
  south_west: 135,
  west: 180,
  north_west: 225,
  north: 270,
  north_east: 315
}
const DIRECTION_ARROW_RADIUS = 55
const DIRECTION_ARROW_CENTER = 110
const DIRECTION_ARROW_ROTATE_OFFSET = 90

export function resolveDirectionArrowStyle(facing) {
  const angle = DIRECTION_ARROW_ANGLE_MAP[facing]
  if (angle === undefined) {
    return ''
  }
  const radians = (angle * Math.PI) / 180
  const left = DIRECTION_ARROW_CENTER + Math.cos(radians) * DIRECTION_ARROW_RADIUS
  const top = DIRECTION_ARROW_CENTER + Math.sin(radians) * DIRECTION_ARROW_RADIUS
  return [
    `left:${left.toFixed(1)}px`,
    `top:${top.toFixed(1)}px`,
    `transform:translate(-50%, -50%) rotate(${angle + DIRECTION_ARROW_ROTATE_OFFSET}deg)`,
    'transform-origin:center center'
  ].join(';')
}
