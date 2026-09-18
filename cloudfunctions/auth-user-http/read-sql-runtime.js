'use strict'

try {
  module.exports = require('./read-sql-runtime-core')
} catch (error) {
  if (error?.code !== 'MODULE_NOT_FOUND') {
    throw error
  }
  module.exports = require('../read-sql-runtime')
}
