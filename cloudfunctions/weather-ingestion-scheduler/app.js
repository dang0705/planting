'use strict'

const { createRecentWeatherService } = require('./services/recent-weather-service')
const {
  isD0Weather24hTimerEvent,
  isRecentWeatherIngestionTimerEvent,
  handleD0Weather24hTimerEvent,
  handleRecentWeatherTimerEvent
} = require('./routes/recent-weather-routes')
const { createD0TimerAuditService } = require('./services/d0-timer-audit')

const QWEATHER_CONFIG = {
  baseUrl: process.env.QWEATHER_API_BASE_URL || 'https://n773jqqeap.re.qweatherapi.com',
  apiKey: process.env.QWEATHER_API_KEY
}

function parseLimit(value, fallback = 20) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback
  }
  return Math.max(1, Math.min(100, Math.trunc(numeric)))
}

function buildRecentWeatherService() {
  return createRecentWeatherService(QWEATHER_CONFIG)
}

module.exports.main = async function weatherIngestionTimerMain(event = {}, context = {}) {
  if (context && typeof context === 'object') {
    context.callbackWaitsForEmptyEventLoop = false
  }

  const triggerName = String(
    event.TriggerName || event.triggerName || event.name || event.trigger_name || ''
  ).trim()
  const eventType = String(event.Type || event.type || '').trim().toLowerCase()
  const eventKeys = event.keys || event.Params || event.params

  if (isD0Weather24hTimerEvent(event)) {
    return handleD0Weather24hTimerEvent({
      event,
      service: buildRecentWeatherService()
    })
  }

  if (isRecentWeatherIngestionTimerEvent(event)) {
    return handleRecentWeatherTimerEvent({
      event,
      service: buildRecentWeatherService(),
      defaultLimit: parseLimit(process.env.WEATHER_INGESTION_BATCH_LIMIT)
    })
  }

  const type = eventType || 'unknown'
  const typeLabel = triggerName || (type ? `${type}_event` : 'unknown')

  console.log('weather-ingestion-scheduler received non-timer event', {
    type: eventType,
    triggerName,
    eventKeys,
   hasData: !!Object.keys(event).length
 })

  // 被忽略事件也要记审计：status=ignored，按日期聚合到同一 JSON
  const ignoredStartAt = new Date().toISOString()
  try {
    const auditService = createD0TimerAuditService()
    await auditService.appendAuditRecord({
      date: '',
      record: {
        recordId: `${triggerName || 'unknown'}:${ignoredStartAt}`,
        triggerName: triggerName || 'unknown',
        eventType,
        sourceKind: 'weather_timer_ignored',
        startAt: ignoredStartAt,
        endAt: new Date().toISOString(),
        status: 'ignored',
        errorSummary: 'failed:0',
        attempted: 0,
        succeeded: 0,
        failed: 0,
        cities: []
      }
    })
  } catch (auditError) {
    console.error('weather-ingestion-scheduler ignored audit failed', auditError)
  }

  return {
    code: 200,
    message: '非定时触发事件已忽略',
    data: {
      ignored: true,
      eventType: eventType,
      triggerName,
      marker: typeLabel,
      contextType: context?.functionName ? 'cloudbase_context_available' : 'no_context'
    }
  }
}
