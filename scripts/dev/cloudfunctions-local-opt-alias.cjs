'use strict'

const Module = require('node:module')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '..', '..')
const originalResolveFilename = Module._resolveFilename

function resolveOptRequest(request) {
  if (request === '/opt/configs') {
    return path.join(projectRoot, 'cloudfunctions', 'layer', 'configs', 'index.js')
  }

  if (request.startsWith('/opt/configs/')) {
    const relativePath = request.slice('/opt/configs/'.length)
    return path.join(projectRoot, 'cloudfunctions', 'layer', 'configs', relativePath)
  }

  if (request.startsWith('/opt/utils/')) {
    const relativePath = request.slice('/opt/utils/'.length)
    return path.join(projectRoot, 'cloudfunctions', 'layer', 'utils', relativePath)
  }

  return ''
}

Module._resolveFilename = function patchedResolveFilename(request, parent, isMain, options) {
  const localPath = typeof request === 'string' ? resolveOptRequest(request) : ''
  if (localPath) {
    return originalResolveFilename.call(this, localPath, parent, isMain, options)
  }

  return originalResolveFilename.call(this, request, parent, isMain, options)
}
