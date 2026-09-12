'use strict'

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs'

process.env.TCB_ENV = 'cloud1-2grufevs395a9d5e'
const require = createRequire(import.meta.url)
const { _test } = require('../../../../cloudfunctions/plant-user-http/write-proxy.js')

assert.ok(
  _test.parseTrustedPublicOrigin(
    'https://cloud1-2grufevs395a9d5e-1403815561.ap-shanghai.app.tcloudbase.com'
  ),
  '同一 CloudBase 环境的公网 HTTP 域名必须可用于内部转发'
)
assert.equal(
  _test.parseTrustedPublicOrigin('https://example.com'),
  null,
  '写函数转发不得接受任意外部主机'
)
assert.equal(
  _test.parseTrustedPublicOrigin(
    'http://cloud1-2grufevs395a9d5e-1403815561.ap-shanghai.app.tcloudbase.com'
  ),
  null,
  '写函数转发必须使用 HTTPS'
)

const forwardedHeaders = _test.buildForwardHeaders(
  {
    authorization: 'Bearer session',
    connection: 'keep-alive',
    host: 'untrusted.example.com',
    'x-planting-http-identity-ticket': 'signed-ticket'
  },
  Buffer.from('{"x":1}'),
  'cloud1-2grufevs395a9d5e-1403815561.ap-shanghai.app.tcloudbase.com'
)
assert.equal(forwardedHeaders.authorization, 'Bearer session')
assert.equal(forwardedHeaders['x-planting-http-identity-ticket'], 'signed-ticket')
assert.equal(forwardedHeaders.connection, undefined)
assert.equal(
  forwardedHeaders.host,
  'cloud1-2grufevs395a9d5e-1403815561.ap-shanghai.app.tcloudbase.com'
)
assert.equal(forwardedHeaders['content-length'], '7')
assert.equal(forwardedHeaders['x-plant-user-write-proxy'], '1')

const serverSource = fs.readFileSync('cloudfunctions/plant-user-http/native-http-server.js', 'utf8')
assert.match(
  serverSource,
  /const readMain = require\('\.\/read-http'\)\.main/u,
  '原生函数启动时只加载列表读取实现'
)
assert.match(
  serverSource,
  /return isUserPlantListRead \? readMain : loadFullMain\(\)/u,
  '非列表路由必须在同一函数内延迟加载完整 app'
)
assert.doesNotMatch(serverSource, /forwardToWriteFunction|write-proxy/u)

const readSource = fs.readFileSync('cloudfunctions/plant-user-http/read-http.js', 'utf8')
assert.doesNotMatch(readSource, /require\('\.\/app'\)\.main/, '读取冷路径不能加载完整 app')

console.log(
  'plant-user write proxy source contract passed data_mode=unit_fake test_kind=source_contract'
)
