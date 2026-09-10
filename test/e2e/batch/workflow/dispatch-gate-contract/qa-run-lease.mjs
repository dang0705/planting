import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import {
  QA_RUN_LEASE_ROOT,
  acquireQaRunLease,
  assertQaRunLease,
  readQaRunLease,
  qaRunLeaseArgs
} from '../../../../../scripts/qa/qa-run-lease.mjs'

const dispatchRunId = 'qa-run-lease-contract-001'
const leasePath = path.join(QA_RUN_LEASE_ROOT, `${dispatchRunId}.json`)
fs.rmSync(leasePath, { force: true })

const lease = acquireQaRunLease({ dispatchRunId, kind: 'contract' })
assert.equal(readQaRunLease(dispatchRunId)?.token, lease.token)
assert.deepEqual(qaRunLeaseArgs(lease), [
  `--dispatch-run-id=${dispatchRunId}`,
  `--run-instance-id=${lease.run_instance_id}`,
  `--run-lease-token=${lease.token}`
])
assert.equal(
  assertQaRunLease({
    dispatchRunId,
    runInstanceId: lease.run_instance_id,
    token: lease.token
  }).token,
  lease.token
)
assert.throws(
  () =>
    assertQaRunLease({
      dispatchRunId,
      runInstanceId: 'run-instance-contract-other',
      token: lease.token
    }),
  error => error.code === 'qa_run_lease_run_instance_id_mismatch'
)
assert.throws(
  () => acquireQaRunLease({ dispatchRunId, kind: 'second' }),
  error => error.code === 'qa_run_lease_conflict'
)
assert.equal(lease.release(), true)
assert.equal(readQaRunLease(dispatchRunId), null)
console.log('QA run lease contract passed')
