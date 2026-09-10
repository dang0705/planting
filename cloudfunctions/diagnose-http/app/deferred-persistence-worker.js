'use strict'

const { persistRoundResult } = require('./deferred-persistence')

let rawInput = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', chunk => {
  rawInput += chunk
})
process.stdin.on('end', async () => {
  try {
    const job = JSON.parse(rawInput)
    await persistRoundResult({
      ...job,
      awaitPersistence: true
    })
  } catch (error) {
    console.error('diagnosis-http deferred persistence worker failed:', {
      message: String(error?.message || error || '')
    })
    process.exitCode = 1
  }
})
