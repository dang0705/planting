'use strict'

const path = require('node:path')
const { spawn } = require('node:child_process')

function dispatchDeferredPersistence(job = {}) {
  const workerPath = path.join(__dirname, 'deferred-persistence-worker.js')
  try {
    const child = spawn(process.execPath, [workerPath], {
      detached: true,
      stdio: ['pipe', 'ignore', 'ignore'],
      env: process.env
    })
    child.once('error', error => {
      console.error('diagnosis-http deferred persistence worker process error:', {
        message: String(error?.message || error || '')
      })
    })
    child.stdin.end(JSON.stringify(job))
    child.unref()
    return true
  } catch (error) {
    console.error('diagnosis-http deferred persistence worker dispatch failed:', {
      message: String(error?.message || error || '')
    })
    return false
  }
}

module.exports = { dispatchDeferredPersistence }
