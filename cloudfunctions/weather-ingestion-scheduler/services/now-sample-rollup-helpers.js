'use strict'

const DAYLIGHT_SLOT_NAMES = ['sunrise', 'morning', 'forenoon', 'noon', 'afternoon', 'sunset']

function roundMetric(value, precision = 1) {
  if (!Number.isFinite(value)) {
    return null
  }
  const multiplier = 10 ** precision
  return Math.round(value * multiplier) / multiplier
}

function mean(values = []) {
  return values.length ? roundMetric(values.reduce((a, b) => a + b, 0) / values.length) : null
}

function max(values = []) {
  return values.length ? Math.max(...values) : null
}

function percentile(values = [], ratio = 0.75) {
  if (!values.length) {
    return null
  }
  const ordered = values.slice().sort((left, right) => left - right)
  const index = Math.max(0, Math.ceil(ordered.length * ratio) - 1)
  return ordered[index]
}

function dominantText(samples = []) {
  const counts = new Map()
  for (const sample of samples) {
    if (sample?.text) {
      counts.set(sample.text, (counts.get(sample.text) || 0) + 1)
    }
  }
  let dominant = ''
  let maxCount = 0
  for (const [text, count] of counts.entries()) {
    if (count > maxCount) {
      dominant = text
      maxCount = count
    }
  }
  return dominant
}

function classifyHeatStressLevel(tempMax = null) {
  if (tempMax === null) {
    return 'none'
  }
  if (tempMax >= 35) {
    return 'high'
  }
  if (tempMax >= 30) {
    return 'medium'
  }
  return 'low'
}

function classifyColdStressLevel(tempMin = null) {
  if (tempMin === null) {
    return 'none'
  }
  if (tempMin <= 5) {
    return 'high'
  }
  if (tempMin <= 10) {
    return 'medium'
  }
  return 'low'
}

function classifyWetSoilRisk(precipSum = null, humidityMean = null) {
  if (precipSum === null && humidityMean === null) {
    return 'none'
  }
  if ((precipSum ?? 0) >= 10 || (humidityMean ?? 0) >= 85) {
    return 'high'
  }
  if ((precipSum ?? 0) >= 3 || (humidityMean ?? 0) >= 75) {
    return 'medium'
  }
  return 'low'
}

function classifyLowLightProxy(daylightCloudMean = null) {
  if (daylightCloudMean === null) {
    return 'none'
  }
  if (daylightCloudMean >= 80) {
    return 'high'
  }
  if (daylightCloudMean >= 60) {
    return 'medium'
  }
  return 'low'
}

module.exports = {
  DAYLIGHT_SLOT_NAMES,
  classifyColdStressLevel,
  classifyHeatStressLevel,
  classifyLowLightProxy,
  classifyWetSoilRisk,
  dominantText,
  max,
  mean,
  percentile,
  roundMetric
}
