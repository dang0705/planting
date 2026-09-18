import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// data_mode=unit_fake; test_kind=source_contract。真实抖音 code、client_token、RSA 密文与真机授权必须在平台环境验收。
const source = readFileSync('cloudfunctions/layer/utils/platform-phone-verifiers.js', 'utf8')
const authEntry = readFileSync('cloudfunctions/auth-user-http/app.js', 'utf8')
const envExample = readFileSync('.env.local.example', 'utf8')

assert.match(authEntry, /platform-phone-verifiers/)
assert.match(source, /https:\/\/open\.douyin\.com\/oauth\/client_token\//)
assert.match(source, /https:\/\/open\.douyin\.com\/api\/apps\/v1\/get_phonenumber_info\//)
assert.match(source, /grant_type:\s*'client_credential'/)
assert.match(source, /'access-token':\s*clientToken/)
assert.match(source, /crypto\.privateDecrypt/)
assert.match(source, /RSA_PKCS1_PADDING/)
assert.match(source, /watermark\?\.appid|watermark\?\.appId/)
assert.match(source, /data\.encryptedData/)
assert.match(source, /aes-128-cbc/)
assert.match(
  envExample,
  /DOUYIN_CLIENT_TOKEN_URL=https:\/\/open\.douyin\.com\/oauth\/client_token\//
)
assert.match(
  envExample,
  /DOUYIN_PHONE_NUMBER_URL=https:\/\/open\.douyin\.com\/api\/apps\/v1\/get_phonenumber_info\//
)
assert.match(envExample, /DOUYIN_PHONE_PRIVATE_KEY_BASE64=/)

console.log('douyin official phone contract tests passed')
