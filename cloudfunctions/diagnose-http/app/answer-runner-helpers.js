'use strict'

function runDeferredAnswerPersistence(sessionId = '', jobs = []) {
  for (const job of jobs) {
    if (typeof job !== 'function') {
      continue
    }
    Promise.resolve()
      .then(job)
      .catch(error => {
        console.error('diagnosis-answer deferred persistence failed:', {
          sessionId,
          message: String(error?.message || error || '')
        })
      })
  }
}

module.exports = {
  runDeferredAnswerPersistence
}
