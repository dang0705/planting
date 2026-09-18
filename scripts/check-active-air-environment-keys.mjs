import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const roots = [
  'src',
  'cloudfunctions',
  'test/unit',
  'test/e2e/batch/cross-contract',
  'test/e2e/batch/diagnosis'
]
const retiredKeys = [
  'airflow_humidity_area',
  'airflow_humidity_context',
  'stagnant_humid',
  'dry_or_drafty',
  'stable_airflow',
  'ac_heater_fan_direct'
]
const ignoredDirectories = new Set(['node_modules', '.git', '_history', 'manifests'])
const findings = []

function inspectDirectory(relativeDirectory) {
  const directory = path.join(repoRoot, relativeDirectory)
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relativePath = path.join(relativeDirectory, entry.name)
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        inspectDirectory(relativePath)
      }
      continue
    }
    if (!/\.(?:js|mjs|vue)$/.test(entry.name) || entry.name.endsWith('.report.json')) {
      continue
    }
    const source = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
    for (const key of retiredKeys) {
      if (source.includes(key)) {
        findings.push(`${relativePath}: ${key}`)
      }
    }
  }
}

for (const root of roots) {
  inspectDirectory(root)
}

if (findings.length) {
  console.error('Active air-environment retired keys found:')
  for (const finding of findings) {
    console.error(`- ${finding}`)
  }
  process.exitCode = 1
} else {
  console.log('Active air-environment key check passed')
}
