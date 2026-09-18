import assert from 'node:assert/strict'

import { classifyQaProjectOpenFailure } from '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/test-owned-qa-session.mjs'

const invalidTokenResponse = {
  action: 'open',
  status_code: 400,
  body_excerpt:
    '{"code":10,"error":"INVALID_TOKEN,invalid credential, access_token is invalid or not latest"}'
}

assert.equal(
  classifyQaProjectOpenFailure({
    openCli: { timedOut: false },
    openCliAttempts: [invalidTokenResponse],
    recoveryError: { code: 'qa_test_owned_open_failed', details: invalidTokenResponse }
  }),
  'qa_auth_server_invalidated'
)

assert.equal(
  classifyQaProjectOpenFailure({
    openCli: { timedOut: true },
    openCliAttempts: [{ action: 'open', status_code: 504, body_excerpt: 'gateway timeout' }]
  }),
  'qa_project_open_timeout'
)

assert.equal(
  classifyQaProjectOpenFailure({
    openCli: { timedOut: false },
    openCliAttempts: [{ action: 'open', status_code: 400, body_excerpt: 'project invalid' }]
  }),
  'qa_project_open_failed'
)

console.log('QA auth failure classification contract passed')
