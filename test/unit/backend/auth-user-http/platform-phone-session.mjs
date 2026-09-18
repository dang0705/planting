import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// data_mode=unit_fake; test_kind=source_contract。平台 code 的真实一次性消费需在平台凭据配置后验证。
const source = readFileSync('cloudfunctions/auth-user-http/app.js', 'utf8')
const verifier = readFileSync('cloudfunctions/layer/utils/platform-phone-verifiers.js', 'utf8')

assert.match(source, /assertNoClientIdentityFields/)
assert.match(source, /PHONE_AUTH_REQUIRED/)
assert.match(source, /verifyDouyinPhoneAuthorization/)
assert.match(verifier, /getDouyinClientToken/)
assert.match(verifier, /decryptDouyinPhonePayload/)
assert.match(verifier, /DOUYIN_PHONE_PRIVATE_KEY/)
assert.match(source, /verifyXhsPhoneAuthorization/)
assert.match(source, /platformUserId/)
assert.match(source, /phone_hash/)
assert.match(source, /phone_ciphertext/)
assert.match(source, /user_sessions/)
assert.match(source, /phone_proof_hash/)
assert.match(source, /PLATFORM_PHONE_PROOF_CONSUMED/)
assert.match(source, /PLATFORM_IDENTITY_PHONE_CONFLICT/)
assert.doesNotMatch(source, /phoneNumber:\s*data\.phoneNumber/)

console.log('platform phone session source-contract tests passed')
