'use strict'

const { createHttpFunctionApp } = require('/opt/utils/http')
const { createPaymentRouteTable } = require('./modules/payment')

module.exports.main = createHttpFunctionApp({
  name: 'payment',
  routeTable: createPaymentRouteTable()
})
