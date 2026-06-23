import assert from 'assert'

const { buildSolarTermCalendar, createSeasonCalendarService, findTermWindow } =
  await import('../../cloudfunctions/weather-ingestion-scheduler/services/season-calendar.js')
const {
  buildDailyCronFromMinuteOfDay,
  buildSunriseTriggerName,
  buildSunsetTriggerName,
  createCloudBaseTriggerClient,
  createSeasonTriggerSyncService,
  resolveHotCitiesForSeasonSync
} = await import('../../cloudfunctions/weather-ingestion-scheduler/services/season-trigger-sync.js')
const { buildSeasonTriggerStateObjectPath, buildSolarTermCalendarObjectPath, toSafeLocationKey } =
  await import('../../cloudfunctions/weather-ingestion-scheduler/services/weather-cache-paths.js')

function createMemoryStorage(seed = {}) {
  const json = new Map(Object.entries(seed.json || {}))
  const text = new Map(Object.entries(seed.text || {}))
  return {
    json,
    text,
    async downloadJson({ cloudPath } = {}) {
      return json.get(cloudPath) || null
    },
    async uploadJson({ cloudPath, payload } = {}) {
      json.set(cloudPath, payload)
      return { cloudPath, fileId: `file://${cloudPath}` }
    },
    async downloadText({ cloudPath } = {}) {
      return text.get(cloudPath) || ''
    },
    async uploadText({ cloudPath, content } = {}) {
      text.set(cloudPath, content)
      return { cloudPath, fileId: `file://${cloudPath}` }
    }
  }
}

const calendar2026 = buildSolarTermCalendar(2026)
assert.equal(calendar2026.country, 'cn')
assert.equal(calendar2026.terms.length, 24)
assert.deepEqual(
  calendar2026.terms.find(term => term.termName === '夏至'),
  { date: '2026-06-21', termName: '夏至', termIndex: 11, seasonSegment: 'summer' }
)
assert.equal(
  Object.prototype.hasOwnProperty.call(calendar2026.terms[0], 'locationKey'),
  false,
  '全国节气历不得包含 locationKey'
)
assert.equal(
  buildSolarTermCalendarObjectPath(2026),
  'weather-cache/v1/solar-term-calendar/cn/2026.json'
)
assert.equal(toSafeLocationKey('city:shanghai'), 'city_shanghai')
assert.equal(buildSunriseTriggerName('city:beijing'), 'weather-d0-now-sunrise__city_beijing')
assert.equal(buildSunsetTriggerName('city:beijing'), 'weather-d0-now-sunset__city_beijing')
assert.equal(buildDailyCronFromMinuteOfDay(291), '0 51 4 * * * *')

{
  const storage = createMemoryStorage()
  const calendarService = createSeasonCalendarService({
    storage,
    now: () => new Date('2026-06-22T08:00:00+08:00')
  })
  const first = await calendarService.resolveTodayTerm()
  assert.deepEqual(first.years, [2025, 2026, 2027])
  assert.deepEqual(first.createdYears, [2025, 2026, 2027])
  assert.equal(first.currentTerm, null)
  assert.ok(first.previousTerm, '跨年/三年窗口应能找到 previousTerm')
  assert.ok(first.nextTerm, '跨年/三年窗口应能找到 nextTerm')
  const second = await calendarService.resolveTodayTerm()
  assert.deepEqual(second.createdYears, [], '已存在日历不得重算')
}

{
  const terms = [
    ...buildSolarTermCalendar(2025).terms,
    ...buildSolarTermCalendar(2026).terms,
    ...buildSolarTermCalendar(2027).terms
  ]
  const window = findTermWindow(terms, '2026-01-01')
  assert.equal(window.currentTerm, null)
  assert.equal(window.previousTerm.termName, '冬至')
  assert.equal(window.nextTerm.termName, '小寒')
}

{
  const env = { WEATHER_HOT_CITY_INGESTION_KEYS: 'city:shanghai, city:beijing,city:shanghai,,' }
  const selection = resolveHotCitiesForSeasonSync({ env })
  assert.equal(selection.fallbackUsed, false)
  assert.deepEqual(
    selection.cities.map(city => city.locationKey),
    ['city:shanghai', 'city:beijing']
  )
  assert.equal(selection.cities[0].timezone, 'Asia/Shanghai')
  assert.equal(selection.cities[0].isActive, true)
}

{
  const selection = resolveHotCitiesForSeasonSync({ env: {} })
  assert.equal(selection.fallbackUsed, true)
  assert.ok(selection.cities.length > 1)
}

{
  const createdPayloads = []
  const deleted = []
  const client = createCloudBaseTriggerClient({
    env: {
      CLOUDBASE_ENV_ID: 'cloud1-2grufevs395a9d5e',
      CLOUDBASE_SECRET_ID: 'sid',
      CLOUDBASE_SECRET_KEY: 'skey'
    },
    functions: {
      async deleteFunctionTrigger(functionName, triggerName) {
        deleted.push({ functionName, triggerName })
      },
      async createFunctionTriggers(functionName, triggers) {
        createdPayloads.push({ functionName, triggers })
      }
    }
  })

  await client.updateTimerTrigger({
    triggerName: 'weather-d0-now-sunrise__city_shanghai',
    cron: '0 51 4 * * * *',
    additionalTriggers: [
      { name: 'weather-d0-now-sunset__city_shanghai', config: '0 2 19 * * * *' }
    ]
  })

  const lastPayload = createdPayloads.at(-1)
  assert.ok(lastPayload.triggers.some(trigger => trigger.name === 'weather-ingestion-recent-10d'))
  assert.ok(
    lastPayload.triggers.some(trigger => trigger.name === 'weather-d0-now-morning-0920'),
    '提交 sunrise 时必须携带固定 morning 基线，避免 CloudBase 覆盖全集'
  )
  assert.ok(
    lastPayload.triggers.some(trigger => trigger.name === 'weather-d0-now-sunrise__city_shanghai')
  )
  assert.ok(
    lastPayload.triggers.some(trigger => trigger.name === 'weather-d0-now-sunset__city_shanghai')
  )
  assert.ok(deleted.some(item => item.triggerName === 'weather-d0-now-morning-0920'))
}

{
  const storage = createMemoryStorage()
  const triggerCalls = []
  const service = createSeasonTriggerSyncService({
    storage,
    env: { WEATHER_HOT_CITY_INGESTION_KEYS: 'city:shanghai,city:beijing' },
    now: () => new Date('2026-06-21T08:00:00+08:00'),
    triggerClient: {
      async updateTimerTrigger(input) {
        triggerCalls.push(input)
      }
    }
  })
  const result = await service.syncToday()
  assert.equal(result.isTermDay, true)
  assert.equal(result.cityCount, 2)
  assert.equal(triggerCalls.length, 2)
  assert.deepEqual(
    triggerCalls.map(call => call.triggerName),
    ['weather-d0-now-sunrise__city_shanghai', 'weather-d0-now-sunrise__city_beijing']
  )
  assert.ok(triggerCalls[0].additionalTriggers.some(
    trigger => trigger.name === 'weather-d0-now-sunset__city_shanghai'
  ))
  assert.ok(storage.json.has(buildSeasonTriggerStateObjectPath('city:shanghai')))
  assert.ok(storage.text.has('weather-cache/v1/season-trigger-audit/city_shanghai/2026.jsonl'))
}

{
  const statePath = buildSeasonTriggerStateObjectPath('city:shanghai')
  const storage = createMemoryStorage({
    json: {
      [statePath]: {
        lastCron: '0 51 4 * * * *',
        lastTriggerName: 'weather-d0-now-sunrise__city_shanghai',
        lastSunriseMinuteOfDay: 291,
        lastSunset: '2026-06-21T19:02:24+08:00',
        timezone: 'Asia/Shanghai'
      }
    }
  })
  const ensureCalls = []
  const service = createSeasonTriggerSyncService({
    storage,
    env: { WEATHER_HOT_CITY_INGESTION_KEYS: 'city:shanghai' },
    triggerClient: {
      async ensureBaseTimerTriggers(input) {
        ensureCalls.push(input)
        return { count: 7 }
      }
    }
  })
  await service.ensureBaseTimerTriggers()
  assert.deepEqual(ensureCalls[0].additionalTriggers, [
    {
      name: 'weather-d0-now-sunrise__city_shanghai',
      type: 'timer',
      config: '0 51 4 * * * *'
    },
    {
      name: 'weather-d0-now-sunset__city_shanghai',
      type: 'timer',
      config: '0 2 19 * * * *'
    }
  ])
}

{
  const statePath = buildSeasonTriggerStateObjectPath('city:shanghai')
  const initialState = {
    lastCron: '0 50 4 * * * *',
    lastSunriseMinuteOfDay: 290,
    lastSunsetMinuteOfDay: 1142
  }
  const storage = createMemoryStorage({ json: { [statePath]: initialState } })
  const service = createSeasonTriggerSyncService({
    storage,
    env: { WEATHER_HOT_CITY_INGESTION_KEYS: 'city:shanghai' },
    now: () => new Date('2026-06-21T08:00:00+08:00'),
    triggerClient: {
      async updateTimerTrigger() {
        throw new Error('should not update below threshold')
      }
    }
  })
  const result = await service.syncToday()
  assert.equal(result.cities[0].status, 'no-change')
  assert.equal(storage.json.get(statePath), initialState, '漂移小于 15 分钟不得覆盖 state')
}

{
  const statePath = buildSeasonTriggerStateObjectPath('city:shanghai')
  const initialState = {
    lastCron: '0 30 4 * * * *',
    lastSunriseMinuteOfDay: 270
  }
  const storage = createMemoryStorage({ json: { [statePath]: initialState } })
  const service = createSeasonTriggerSyncService({
    storage,
    env: { WEATHER_HOT_CITY_INGESTION_KEYS: 'city:shanghai' },
    now: () => new Date('2026-06-21T08:00:00+08:00'),
    triggerClient: {
      async updateTimerTrigger() {
        throw new Error('manager down')
      }
    }
  })
  const result = await service.syncToday()
  assert.equal(result.cities[0].status, 'update-failed')
  assert.equal(storage.json.get(statePath), initialState, '更新失败不得覆盖 lastCron/state')
  assert.match(
    storage.text.get('weather-cache/v1/season-trigger-audit/city_shanghai/2026.jsonl'),
    /update-failed/
  )
}

{
  const storage = createMemoryStorage()
  const service = createSeasonTriggerSyncService({
    storage,
    env: { WEATHER_HOT_CITY_INGESTION_KEYS: 'city:shanghai' },
    now: () => new Date('2026-06-22T08:00:00+08:00'),
    triggerClient: {
      async updateTimerTrigger() {
        throw new Error('non-term day must not update')
      }
    }
  })
  const result = await service.syncToday()
  assert.equal(result.isTermDay, false)
  assert.equal(result.cityCount, 0)
  assert.equal(storage.json.has(buildSeasonTriggerStateObjectPath('city:shanghai')), false)
  assert.match(
    storage.text.get('weather-cache/v1/season-trigger-audit/global/2026.jsonl'),
    /term-sync-skip-non-term/
  )
}

console.log('season-trigger-sync tests passed')
