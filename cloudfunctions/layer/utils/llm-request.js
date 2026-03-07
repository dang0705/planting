'use strict'

const crypto = require('crypto')

function sha256Hex(content) {
  return crypto.createHash('sha256').update(content).digest('hex')
}

function hmacSha256(key, value, encoding) {
  return crypto.createHmac('sha256', key).update(value).digest(encoding)
}

function createLLMRequestOptions({
  body,
  host,
  service,
  secretId,
  secretKey,
  agent,
  action = 'ChatCompletions',
  version = '2023-09-01'
}) {
  const timestamp = Math.floor(Date.now() / 1000)
  const date = new Date(timestamp * 1000).toISOString().split('T')[0]
  const algorithm = 'TC3-HMAC-SHA256'
  const contentType = 'application/json'
  const actionLower = String(action).toLowerCase()
  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\nx-tc-action:${actionLower}\n`
  const signedHeaders = 'content-type;host;x-tc-action'
  const hashedRequestPayload = sha256Hex(body)
  const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${hashedRequestPayload}`
  const credentialScope = `${date}/${service}/tc3_request`
  const hashedCanonicalRequest = sha256Hex(canonicalRequest)
  const stringToSign = `${algorithm}\n${timestamp}\n${credentialScope}\n${hashedCanonicalRequest}`
  const signingKey = [date, service, 'tc3_request'].reduce(
    (key, value) => hmacSha256(key, value),
    `TC3${secretKey}`
  )
  const signature = hmacSha256(signingKey, stringToSign, 'hex')
  const authorization = `${algorithm} Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  const options = {
    hostname: host,
    path: '/',
    method: 'POST',
    headers: {
      'Content-Type': contentType,
      Host: host,
      'X-TC-Action': action,
      'X-TC-Version': version,
      'X-TC-Timestamp': String(timestamp),
      Authorization: authorization
    }
  }
  if (agent) {
    options.agent = agent
  }
  return options
}

module.exports = {
  createLLMRequestOptions
}
