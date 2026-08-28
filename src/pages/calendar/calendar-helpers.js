export const SOLAR_TERMS = [
  ['小寒', 1, 5],
  ['大寒', 1, 20],
  ['立春', 2, 4],
  ['雨水', 2, 19],
  ['惊蛰', 3, 6],
  ['春分', 3, 21],
  ['清明', 4, 5],
  ['谷雨', 4, 20],
  ['立夏', 5, 6],
  ['小满', 5, 21],
  ['芒种', 6, 6],
  ['夏至', 6, 21],
  ['小暑', 7, 7],
  ['大暑', 7, 23],
  ['立秋', 8, 8],
  ['处暑', 8, 23],
  ['白露', 9, 8],
  ['秋分', 9, 23],
  ['寒露', 10, 8],
  ['霜降', 10, 23],
  ['立冬', 11, 7],
  ['小雪', 11, 22],
  ['大雪', 12, 7],
  ['冬至', 12, 22]
]

export function resolveWeatherIcon(description = '') {
  const icons = [
    ['雷', '⛈️'],
    ['雪', '❄️'],
    ['雨', '🌧️'],
    ['阴', '☁️'],
    ['云', '🌤️'],
    ['晴', '☀️']
  ]
  return icons.find(([key]) => String(description).includes(key))?.[1] || '🌤️'
}

export function normalizeForecast(value) {
  if (!Array.isArray(value)) {
    return []
  }
  return value.slice(0, 7).map((day, index) => ({
    date: String(day.date || day.fxDate || index),
    weekday: index === 0 ? '今天' : index === 1 ? '明天' : `第${index + 1}天`,
    icon: resolveWeatherIcon(day.textDay || day.weather || day.text),
    temp: Number(day.tempMax ?? day.temp ?? day.temperature)
  }))
}

export function solarTermTip(name) {
  if (['小寒', '大寒', '立冬', '小雪', '大雪', '冬至'].includes(name)) {
    return '气温偏低，浇水前先确认盆土状态，避免低温积水。'
  }
  if (['立夏', '小满', '芒种', '夏至', '小暑', '大暑'].includes(name)) {
    return '蒸腾较快，按植物状态和盆土干湿决定是否浇水，避免只看日期。'
  }
  return '季节变化时先观察光照、通风和盆土，再调整养护安排。'
}

export function getTaskIcon(type) {
  const icons = {
    water: '💧',
    fertilize: '🪴',
    prune: '✂️',
    check: '🔍'
  }
  return icons[type] || '📝'
}

export function getTaskName(type) {
  const names = {
    water: '浇水',
    fertilize: '施肥',
    prune: '修剪',
    check: '检查'
  }
  return names[type] || '任务'
}

export function dateText(value) {
  const date = value instanceof Date ? value : new Date(value)
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-')
}

export function addDays(value, days) {
  const date = new Date(value)
  date.setDate(date.getDate() + days)
  return date
}

function parseLocalDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) {
    return null
  }
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatPlantingAge(value, now = new Date()) {
  const plantDate = parseLocalDate(value)
  if (!plantDate) {
    return '已添加'
  }
  const currentDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dayCount = Math.floor((currentDate - plantDate) / (24 * 60 * 60 * 1000))
  if (dayCount < 0) {
    return `计划于 ${dateText(plantDate)} 种植`
  }
  if (dayCount === 0) {
    return '今天种植'
  }
  return `已种植 ${dayCount} 天`
}

export function resolveHealthStatusPresentation(status) {
  const normalized = String(status || '').trim().toLowerCase()
  if (['healthy', 'good', 'normal'].includes(normalized)) {
    return { label: '状态良好', className: 'bg-[#D8F3DC] text-primary' }
  }
  if (['warning', 'attention', 'unhealthy', 'poor'].includes(normalized)) {
    return { label: '需要关注', className: 'bg-[#FFF3E0] text-[#B75A00]' }
  }
  return { label: '状态待评估', className: 'bg-gray-100 text-gray-600' }
}
