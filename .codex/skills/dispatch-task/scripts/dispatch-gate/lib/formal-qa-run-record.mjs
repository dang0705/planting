const RUN_PHASES = Object.freeze([
  'created',
  'owner_recorded',
  'launching',
  'runtime_verified',
  'automator_connected',
  'preflight_passed',
  'leaf_running',
  'leaf_finished',
  'cleaning',
  'cleaned'
])

function transition(phase, detail = {}) {
  return { phase, at: new Date().toISOString(), ...detail }
}

export function createFormalQaRunRecord(record) {
  return {
    ...record,
    status: 'running',
    run_record_version: 2,
    run_phase: 'created',
    transitions: [transition('created')]
  }
}

export function transitionFormalQaRunRecord(record, phase, detail = {}) {
  if (!RUN_PHASES.includes(phase)) {
    throw new Error(`unknown formal QA run phase: ${phase}`)
  }
  if (record.status !== 'running') {
    throw new Error(`cannot transition terminal formal QA record from ${record.status}`)
  }
  return {
    ...record,
    ...detail,
    run_phase: phase,
    transitions: [...record.transitions, transition(phase, detail.transition_evidence)]
  }
}

export function finalizeFormalQaRunRecord(record, status, detail = {}) {
  if (record.run_phase !== 'cleaned') {
    throw new Error('formal QA terminal record requires completed cleanup')
  }
  return {
    ...record,
    ...detail,
    status,
    completed_at: new Date().toISOString()
  }
}
