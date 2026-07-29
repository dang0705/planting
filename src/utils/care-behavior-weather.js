const SAFE_NUMBER_PATTERN = /^-?\d+(?:\.\d+)?$/

function normalizeToRounded(value) {
  const raw = value === null || value === undefined ? '' : String(value).trim()
  if (!raw) {
    return ''
  }
  const numeric = Number(raw)
  return Number.isFinite(numeric) ? `${Math.round(numeric)}` : raw
}

export function formatWeatherText(entry = {}) {
  if (!entry || typeof entry !== 'object') {
    return String(entry || '').trim() ? String(entry).trim() : ''
  }

  const weather = String(
    entry.weather || entry.weatherText || entry.text || entry.description || entry.textDay || entry.textNight || ''
  ).trim()

  const maxTemp = normalizeToRounded(
    entry.tempMaxC ?? entry.tempMax ?? entry.maxTemp ?? entry.maxTemperature ?? entry.tempMaxF ?? ''
  )
  const minTemp = normalizeToRounded(
    entry.tempMinC ?? entry.tempMin ?? entry.minTemp ?? entry.minTemperature ?? entry.tempMinF ?? ''
  )
  const singleTemp = normalizeToRounded(
    entry.temp ?? entry.temperature
  )

  const humidity = normalizeToRounded(entry.humidity ?? entry.humi)

  const hasMaxLike = SAFE_NUMBER_PATTERN.test(maxTemp)
  const hasMinLike = SAFE_NUMBER_PATTERN.test(minTemp)

  const pieces = []
  if (weather) {
    pieces.push(weather)
  }

  if (maxTemp || minTemp) {
    if (hasMaxLike && hasMinLike) {
      pieces.push(`${maxTemp}/${minTemp}℃`)
    } else if (maxTemp) {
      pieces.push(`${maxTemp}℃`)
    } else {
      pieces.push(`${minTemp}℃`)
    }
  } else if (singleTemp) {
    pieces.push(`${singleTemp}℃`)
  }

  if (humidity) {
    pieces.push(`${humidity}%`)
  }

  return pieces.filter(Boolean).join(' · ')
}
