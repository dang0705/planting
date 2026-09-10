import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

// data_mode=unit_fake; test_kind=unit_logic。验证最小读取运行时与项目既有 TC3 签名器完全一致，不发 HTTP 请求。
const require = createRequire(import.meta.url)
const runtime = require('../../../cloudfunctions/read-sql-runtime.js')
const cloudbaseSigner = require('../../../cloudfunctions/layer/node_modules/@cloudbase/signature-nodejs')

const request = {
  secretId: 'AKIDunit',
  secretKey: 'unit-secret',
  method: 'post',
  url: 'https://cloud1-unit.internal.ap-shanghai.tcb-api.tencentcloudapi.com/admin?env=cloud1-unit&seqId=unit',
  params: {
    action: 'functions.invokeFunction',
    function_name: 'lowcode-datasource',
    request_data: '{"unit":true}',
    envName: 'cloud1-unit',
    wxCloudApiToken: '',
    tcb_sessionToken: '',
    crossAuthorizationToken: '',
    sessionToken: 'token'
  },
  headers: {
    'Content-Type': 'application/json',
    Host: 'cloud1-unit.internal.ap-shanghai.tcb-api.tencentcloudapi.com',
    'User-Agent': 'tcb-node-sdk/3.18.0',
    'X-TCB-Source': ',scf',
    'X-Client-Timestamp': '1700000000000',
    'X-SDK-Version': 'tcb-node-sdk/3.18.0',
    'X-Signature-Expires': '600',
    'X-Timestamp': '1700000000'
  },
  timestamp: 1_700_000_000
}

assert.equal(
  runtime._test.signRequest(request).authorization,
  cloudbaseSigner.sign({ ...request, service: 'tcb', withSignedParams: true }).authorization
)
assert.equal(
  runtime._test.qualifyTables('SELECT * FROM users u JOIN user_sessions s ON s.user_id = u._id', 'cloud1_dev'),
  'SELECT * FROM `cloud1_dev`.`users` u JOIN `cloud1_dev`.`user_sessions` s ON s.user_id = u._id'
)
assert.throws(
  () => runtime._test.qualifyTables('SELECT * FROM users', 'cloud1_dev;DROP'),
  { code: 'CLOUDBASE_SQL_SCHEMA_INVALID' }
)

const previousRunEnv = process.env.TENCENTCLOUD_RUNENV
const previousCbrEnvId = process.env.CBR_ENV_ID
const previousSumeruEnv = process.env.SUMERU_ENV
delete process.env.TENCENTCLOUD_RUNENV
delete process.env.CBR_ENV_ID
process.env.SUMERU_ENV = 'formal'
assert.equal(runtime._test.resolveRunEnvTag(), 'sumeru')
if (previousRunEnv === undefined) delete process.env.TENCENTCLOUD_RUNENV
else process.env.TENCENTCLOUD_RUNENV = previousRunEnv
if (previousCbrEnvId === undefined) delete process.env.CBR_ENV_ID
else process.env.CBR_ENV_ID = previousCbrEnvId
if (previousSumeruEnv === undefined) delete process.env.SUMERU_ENV
else process.env.SUMERU_ENV = previousSumeruEnv

console.log('read sql runtime tests passed data_mode=unit_fake test_kind=unit_logic')
