'use strict'

function isLocalGatewayRuntime(value) {
  return /^(1|true)$/i.test(String(value || '').trim())
}

module.exports = { isLocalGatewayRuntime }
