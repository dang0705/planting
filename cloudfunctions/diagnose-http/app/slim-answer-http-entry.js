'use strict'

module.exports.main = (event, context) => {
  return require('./package-app.js').main(event, context)
}
