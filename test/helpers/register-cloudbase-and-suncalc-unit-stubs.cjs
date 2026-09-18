'use strict'

const Module = require('node:module')
const originalLoad = Module._load

Module._load = function loadUnitRuntimeStub(request, parent, isMain) {
  if (request === '/opt/utils/cloudbase') {
    return {
      models: {
        $runSQL: async () => ({ data: { executeResultList: [] } })
      }
    }
  }
  if (request === 'suncalc') {
    return {
      getTimes(date) {
        const base = new Date(date)
        return {
          sunrise: new Date(base.getTime() - 6 * 60 * 60 * 1000),
          sunset: new Date(base.getTime() + 6 * 60 * 60 * 1000)
        }
      }
    }
  }
  if (request === 'date-fns-tz') {
    return {
      fromZonedTime: value => new Date(value),
      toZonedTime: value => new Date(value),
      formatInTimeZone: value => new Date(value).toISOString()
    }
  }
  return originalLoad.call(this, request, parent, isMain)
}
