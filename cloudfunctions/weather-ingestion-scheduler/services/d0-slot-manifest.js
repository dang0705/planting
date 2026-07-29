'use strict'

// D0 slot manifest：存储-backed 的 slot job state
// scheduler 是唯一 owner，负责 seed -> drain(分批推进) -> complete
// 单城 retry/fallback 仍在 worker (service.updateNowSample) 内部，不在此层

const { createWeatherObjectStorage } = require('./weather-object-storage')
const { buildD0SlotManifestPath } = require('./d0-slot-paths')
const { listConfiguredHotCitiesForIngestion } = require('./hot-city-locations')
const {
  isFinalizeSlot,
  formatIsoInTimezone,
  resolveSlotForTriggerName
} = require('./now-sample-slots')

const MANIFEST_SCHEMA_VERSION = 'weather-cache/v1/d0-slot-manifest'
const DEFAULT_BATCH_SIZE = 5

function formatShanghaiDate(date) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(date)
    const partMap = Object.fromEntries(parts.map(p => [p.type, p.value]))
    return `${partMap.year}-${partMap.month}-${partMap.day}`
  } catch {
    return date.toISOString().slice(0, 10)
  }
}

// manifest 时间字段使用 Asia/Shanghai 本地 ISO 字符串，不使用 UTC toISOString()
function localNowIso() {
  return formatIsoInTimezone(new Date(), 'Asia/Shanghai')
}

function resolveTargetDate(value = '') {
  const explicit = String(value || '')
    .trim()
    .slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(explicit)) {
    return explicit
  }
  return formatShanghaiDate(new Date())
}

function parseBatchSize(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return DEFAULT_BATCH_SIZE
  }
  return Math.max(1, Math.min(50, Math.trunc(numeric)))
}

function createD0SlotManifestService({
  storage = createWeatherObjectStorage(),
  env = process.env
} = {}) {
  async function seedManifest({
    triggerName = '',
    targetDate = '',
    cities = null,
    batchSize = null
  } = {}) {
    const slotName = resolveSlotForTriggerName(triggerName)
    if (!slotName) {
      throw new Error(`未知 D0 slot triggerName: ${triggerName}`)
    }
    const finalized = isFinalizeSlot(slotName)
    const resolvedDate = resolveTargetDate(targetDate)
    const cityList = Array.isArray(cities) ? cities : listConfiguredHotCitiesForIngestion({ env })
    const resolvedBatchSize = parseBatchSize(batchSize ?? env.WEATHER_D0_SLOT_BATCH_SIZE)

    const now = localNowIso()
    const manifest = {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      date: resolvedDate,
      triggerName,
      slotName,
      finalized,
      status: 'running',
      cursor: 0,
      batchSize: resolvedBatchSize,
      totalCities: cityList.length,
      cities: cityList.map(city => ({
        key: city.key,
        name: city.name,
        latitude: city.latitude,
        longitude: city.longitude
      })),
      completedCities: [],
      failedCities: [],
      cityResults: {},
      seededAt: now,
      updatedAt: now,
      completedAt: ''
    }

    const cloudPath = buildD0SlotManifestPath({ date: resolvedDate, triggerName })
    await storage.uploadJson({ cloudPath, payload: manifest })
    return { manifest, cloudPath }
  }

  async function readManifest({ date = '', triggerName = '' } = {}) {
    const resolvedDate = resolveTargetDate(date)
    const cloudPath = buildD0SlotManifestPath({ date: resolvedDate, triggerName })
    const manifest = await storage.downloadJson({ cloudPath })
    return { manifest, cloudPath }
  }

  async function advanceManifest({ manifest, cloudPath, batchSize = null, worker } = {}) {
    if (!manifest) {
      throw new Error('advanceManifest 缺少 manifest')
    }
    if (manifest.status !== 'running') {
      return {
        manifest,
        cloudPath,
        advanced: false,
        batchResults: [],
        completed: manifest.status === 'completed'
      }
    }
    if (typeof worker !== 'function') {
      throw new Error('advanceManifest 缺少 worker 函数')
    }

    const resolvedBatchSize = parseBatchSize(batchSize ?? manifest.batchSize)
    const startIndex = manifest.cursor
    const endIndex = Math.min(startIndex + resolvedBatchSize, manifest.cities.length)
    const batch = manifest.cities.slice(startIndex, endIndex)

    const batchResults = []
    for (const city of batch) {
      try {
        const result = await worker({
          locationKey: city.key,
          cityName: city.name,
          latitude: city.latitude,
          longitude: city.longitude,
          timezone: 'Asia/Shanghai',
          targetDate: manifest.date,
          triggerName: manifest.triggerName,
          finalize: manifest.finalized
        })
        manifest.completedCities.push(city.key)
        manifest.cityResults[city.key] = {
          ok: true,
          dayObjectPath: result.dayObjectPath || '',
          slotName: result.slotName || '',
          finalized: result.finalized || false,
          recentObjectPath: result.recentObjectPath || '',
          error: ''
        }
        batchResults.push({
          locationKey: city.key,
          ok: true,
          dayObjectPath: result.dayObjectPath || '',
          slotName: result.slotName || '',
          finalized: result.finalized || false,
          recentObjectPath: result.recentObjectPath || '',
          error: ''
        })
      } catch (error) {
        manifest.failedCities.push(city.key)
        const message = error.message || String(error)
        manifest.cityResults[city.key] = {
          ok: false,
          dayObjectPath: '',
          slotName: '',
          recentObjectPath: '',
          error: message
        }
        batchResults.push({
          locationKey: city.key,
          ok: false,
          dayObjectPath: '',
          slotName: '',
          recentObjectPath: '',
          error: message
        })
      }
    }

    manifest.cursor = endIndex
    manifest.updatedAt = localNowIso()
    if (manifest.cursor >= manifest.cities.length) {
      manifest.status = 'completed'
      manifest.completedAt = manifest.updatedAt
    }

    await storage.uploadJson({ cloudPath, payload: manifest })
    return {
      manifest,
      cloudPath,
      advanced: true,
      batchResults,
      completed: manifest.status === 'completed'
    }
  }

  // load or seed：manifest 已存在则直接复用（支持跨 invocation 分批推进），否则 seed 新 job。
  async function loadOrSeedManifest({
    triggerName = '',
    targetDate = '',
    cities = null,
    batchSize = null
  } = {}) {
    const resolvedDate = resolveTargetDate(targetDate)
    const existing = await readManifest({ date: resolvedDate, triggerName })
    if (existing.manifest) {
      return existing
    }
    return seedManifest({ triggerName, targetDate: resolvedDate, cities, batchSize })
  }

  return { seedManifest, readManifest, advanceManifest, loadOrSeedManifest }
}

module.exports = {
  MANIFEST_SCHEMA_VERSION,
  DEFAULT_BATCH_SIZE,
  createD0SlotManifestService,
  resolveTargetDate,
  formatShanghaiDate,
  parseBatchSize
}
