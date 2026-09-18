#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const suite = JSON.parse(await readFile(path.join(repoRoot, 'qa/e2e/suite.manifest.json'), 'utf8'))

const current = suite.leaves.filter(leaf => leaf.id !== 'platform.live_runtime_proof')
const expected = [
  'diagnosis.yellowing.no_image_quick',
  'diagnosis.pest.visual_mode_retake',
  'care.watering.transpiration_v3.independent_advice',
  'care.watering.transpiration_v3.user_plant_planner',
  'care.watering.reminder_dose.bottle_text',
  'care.watering.reminder_dose.dose_dynamic',
  'care.watering.reminder_dose.dose_label_layout',
  'care.watering.reminder_dose.unit_alignment_final',
  'care.watering.reminder_dose.unit_alignment_v4',
  'care.air_exchange.v1',
  'care.air_environment_v2.user_plant_watering',
  'diagnosis.air_environment_v2.question_packages',
  'user.plant_detail.fertilization_reminder_live_development',
  'user.plant_detail.fertilization_monthly',
  'user.plant_detail.fertilization_reminder_setup',
  'user.plant_detail.fertilization_reminder_actions',
  'user.review.subpackage_routing',
  'calendar.task_complete_postpone_and_plan_entry',
  'calendar.weather_and_solar_term_summary',
  'reminder.tab_water_and_fertilization_closure',
  'plant.light_environment_save_event_channel',
  'plant.user_detail_create_edit_view_modes'
]
const byId = new Map(current.map(leaf => [leaf.id, leaf]))
const failures = []

if (current.length !== expected.length) {
  failures.push({ kind: 'count', expected: expected.length, actual: current.length })
}
for (const id of expected) {
  const leaf = byId.get(id)
  if (!leaf) {
    failures.push({ kind: 'missing', id })
    continue
  }
  if (leaf.module !== 'leaves/native-script-leaf.mjs' || !leaf.config?.script) {
    failures.push({ kind: 'non_native_leaf', id, module: leaf.module, script: leaf.config?.script || null })
  }
  const expectedMode = ['diagnosis.pest.visual_mode_retake', 'care.air_environment_v2.user_plant_watering', 'diagnosis.air_environment_v2.question_packages', 'user.plant_detail.fertilization_monthly', 'user.plant_detail.fertilization_reminder_setup', 'user.plant_detail.fertilization_reminder_actions'].includes(id) ? 'fixture_diagnostic' : 'live_real'
  const actualMode = leaf.config?.dataMode || 'live_real'
  if (actualMode !== expectedMode) {
    failures.push({ kind: 'data_mode_mismatch', id, expected: expectedMode, actual: actualMode })
  }
}

const summary = {
  status: failures.length ? 'failed' : 'passed',
  leafCount: expected.length,
  nativeLeafCount: current.filter(leaf => leaf.module === 'leaves/native-script-leaf.mjs').length,
  liveRealLeafCount: current.filter(leaf => (leaf.config?.dataMode || 'live_real') === 'live_real').length,
  fixtureDiagnosticLeafCount: current.filter(leaf => leaf.config?.dataMode === 'fixture_diagnostic').length,
  failures
}
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
process.exitCode = failures.length ? 1 : 0
