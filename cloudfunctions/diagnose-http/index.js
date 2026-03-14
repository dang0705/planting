'use strict'

const { createHttpFunctionApp } = require('/opt/utils/http')
const { createDiagnoseRouteTable, handleCloudFunctionProxy } = require('./modules/diagnose')
const { createRuleDiagnoseRouteTable } = require('./modules/rule-diagnose')

module.exports.main = createHttpFunctionApp({
  name: 'diagnose-http',
  routeTable: {
    ...createDiagnoseRouteTable(),
    ...createRuleDiagnoseRouteTable()
  },
  proxyHandler: handleCloudFunctionProxy
})
