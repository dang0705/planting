function normalizeNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function getSeasonKey(date = new Date()) {
  const month = date.getMonth() + 1
  if (month >= 3 && month <= 5) return 'spring'
  if (month >= 6 && month <= 8) return 'summer'
  if (month >= 9 && month <= 11) return 'autumn'
  return 'winter'
}

function getBaseWateringDays(wateringFreq, now = new Date()) {
  const seasonKey = getSeasonKey(now)
  const config = wateringFreq || {}
  return normalizeNumber(config[seasonKey], normalizeNumber(config.summer, 7)) || 7
}

function getWeatherAdjustmentDays(weatherData = {}) {
  const humidity = normalizeNumber(weatherData.humidity, 0)
  const temperature = normalizeNumber(weatherData.temperature, 0)
  const weatherText = String(weatherData.weather || '').trim()

  let adjustment = 0
  if (temperature >= 32) adjustment -= 1
  if (temperature <= 8) adjustment += 1
  if (humidity >= 85) adjustment += 1
  if (humidity > 0 && humidity <= 35) adjustment -= 1
  if (/雨|雷|暴雨|阵雨/.test(weatherText)) adjustment += 1
  if (/晴|大风|干燥|热/.test(weatherText)) adjustment -= 1

  return Math.max(-2, Math.min(2, adjustment))
}

export function buildWateringReminder(plant, weatherData, nowInput = new Date()) {
  const now = new Date(nowInput)
  const baseDays = getBaseWateringDays(plant?.wateringFreq, now)
  const weatherAdjustmentDays = getWeatherAdjustmentDays(weatherData)
  const recommendedDays = Math.max(1, baseDays + weatherAdjustmentDays)
  const nextWater = plant?.nextWater ? new Date(plant.nextWater) : null
  const diffDays = nextWater ? Math.ceil((nextWater.getTime() - now.getTime()) / 86400000) : null

  let level = 'normal'
  let message = '按计划浇水即可'
  if (!nextWater) {
    level = 'attention'
    message = '缺少下次浇水时间，建议尽快补充记录'
  } else if (diffDays <= 0) {
    level = 'urgent'
    message = weatherAdjustmentDays < 0 ? '建议今天优先浇水，天气偏热或偏干' : '建议今天浇水'
  } else if (diffDays <= 1) {
    level = 'attention'
    message = '建议明天前后检查盆土状态，视情况浇水'
  }

  return {
    plantId: plant?.id,
    plantName: plant?.name || plant?.plantName || '未命名植物',
    nextWater: plant?.nextWater || null,
    baseDays,
    weatherAdjustmentDays,
    recommendedDays,
    level,
    message
  }
}

export function buildWateringReminders(plants = [], weatherData = {}, now = new Date()) {
  return plants
    .map(plant => buildWateringReminder(plant, weatherData, now))
    .sort((a, b) => {
      const priority = { urgent: 0, attention: 1, normal: 2 }
      return (priority[a.level] ?? 9) - (priority[b.level] ?? 9)
    })
}
