'use strict'

const { createHttpFunctionApp } = require('/opt/utils/http')
const { createDiagnoseRouteTable, handleCloudFunctionProxy } = require('./modules/diagnose')

module.exports.main = createHttpFunctionApp({
  name: 'diagnose-http',
  routeTable: createDiagnoseRouteTable(),
  proxyHandler: handleCloudFunctionProxy
})
