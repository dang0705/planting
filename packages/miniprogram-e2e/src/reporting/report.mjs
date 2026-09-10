import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  BUSINESS_STATUSES,
  FAILURE_KINDS,
  FIXTURE_STATUSES,
  INFRASTRUCTURE_STATUSES,
  OUTCOMES
} from '../contracts/index.mjs'

/** @param {unknown} error */
export function errorEvidence(error) {
  return {
    code: String(error?.code || 'mp_e2e_error'),
    message: String(error?.message || error || 'unknown error'),
    stack: typeof error?.stack === 'string' ? error.stack : null
  }
}

/** @param {object} report */
export function assertReport(report) {
  if (!OUTCOMES.includes(report.outcome)) {throw new Error('invalid report outcome')}
  if (!INFRASTRUCTURE_STATUSES.includes(report.infrastructureStatus)) {throw new Error('invalid infrastructure status')}
  if (!FIXTURE_STATUSES.includes(report.fixtureStatus)) {throw new Error('invalid fixture status')}
  if (!BUSINESS_STATUSES.includes(report.businessStatus)) {throw new Error('invalid business status')}
  if (!FAILURE_KINDS.includes(report.failureKind)) {throw new Error('invalid failure kind')}
  return report
}

/** @param {string} evidenceDir @param {object} report */
export async function writeReport(evidenceDir, report) {
  await mkdir(evidenceDir, { recursive: true })
  const file = path.join(evidenceDir, 'mp-e2e-report.json')
  await writeFile(file, `${JSON.stringify(assertReport(report), null, 2)}\n`)
  return file
}
