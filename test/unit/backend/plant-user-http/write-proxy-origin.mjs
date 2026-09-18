import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const previousTcbEnv = process.env.TCB_ENV
const previousOrigin = process.env.PLANT_USER_WRITE_PROXY_ORIGIN
process.env.TCB_ENV = 'cloud1-2grufevs395a9d5e'
delete process.env.PLANT_USER_WRITE_PROXY_ORIGIN

try {
  const require = createRequire(import.meta.url)
  const { _test } = require('../../../../cloudfunctions/plant-user-http/write-proxy.js')
  assert.equal(
    _test.resolveWriteFunctionOrigin({ host: '127.0.0.1:9000' })?.hostname,
    'cloud1-2grufevs395a9d5e-1403815561.ap-shanghai.app.tcloudbase.com',
    '公网 Host 被 CloudBase 内部转发覆盖时必须安全回退到当前环境公网服务域名'
  )
} finally {
  if (previousTcbEnv === undefined) {
    delete process.env.TCB_ENV
  } else {
    process.env.TCB_ENV = previousTcbEnv
  }
  if (previousOrigin === undefined) {
    delete process.env.PLANT_USER_WRITE_PROXY_ORIGIN
  } else {
    process.env.PLANT_USER_WRITE_PROXY_ORIGIN = previousOrigin
  }
}

console.log(
  'plant-user write proxy origin fallback contract passed data_mode=unit_fake test_kind=source_contract'
)
