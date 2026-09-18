/* oxlint-disable no-console, no-magic-numbers */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { inspectHttpFunctionPackage } from '../qa/function-package-integrity.mjs'

const projectRoot = path.resolve(new URL('../..', import.meta.url).pathname)
const DIAGNOSIS_SPLIT_FUNCTIONS = new Set([
  'diagnosis-question-start-http',
  'diagnosis-answer-http'
])

export const DEPLOYMENT_IGNORED_DIRECTORY_NAMES = new Set([
  '.git',
  '.tmp',
  'dist',
  'node_modules',
  'logs'
])
export const DEPLOYMENT_IGNORED_FILE_NAMES = new Set(['.DS_Store'])

const READER_SQL_RUNTIME_FUNCTIONS = new Set(['auth-user-http', 'plant-user-http'])
const READER_SQL_RUNTIME_SOURCE = path.join(projectRoot, 'cloudfunctions', 'read-sql-runtime.js')
const FUNCTION_BUNDLED_RUNTIME_FILES = new Map([
  [
    'auth-user-http',
    [
      {
        source: path.join(
          projectRoot,
          'cloudfunctions',
          'layer',
          'utils',
          'http-identity-ticket.js'
        ),
        target: 'http-identity-ticket.js'
      }
    ]
  ],
  [
    'plant-user-http',
    [
      {
        source: path.join(
          projectRoot,
          'cloudfunctions',
          'layer',
          'utils',
          'watering-soil-visual.js'
        ),
        target: 'watering-soil-visual.js'
      },
      {
        source: path.join(
          projectRoot,
          'cloudfunctions',
          'layer',
          'utils',
          'http-identity-ticket.js'
        ),
        target: 'http-identity-ticket.js'
      }
    ]
  ],
  [
    'plant-catalog-http',
    [
      {
        source: path.join(projectRoot, 'cloudfunctions', 'layer', 'utils', 'catalog-image-url.js'),
        target: 'catalog-image-url.js'
      }
    ]
  ],
  [
    'storage-http',
    [
      {
        source: path.join(projectRoot, 'cloudfunctions', 'layer', 'utils', 'cloudbase.js'),
        target: 'cloudbase.js'
      },
      {
        source: path.join(projectRoot, 'cloudfunctions', 'layer', 'utils', 'runtime-env.js'),
        target: 'runtime-env.js'
      },
      {
        source: path.join(projectRoot, 'cloudfunctions', 'layer', 'utils', 'platform-session.js'),
        target: 'platform-session.js'
      }
    ]
  ],
  [
    'diagnose-http',
    [
      {
        source: path.join(projectRoot, 'cloudfunctions', 'layer', 'utils', 'cloudbase.js'),
        target: 'cloudbase.js'
      },
      {
        source: path.join(projectRoot, 'cloudfunctions', 'layer', 'utils', 'runtime-env.js'),
        target: 'runtime-env.js'
      },
      {
        source: path.join(
          projectRoot,
          'cloudfunctions',
          'layer',
          'utils',
          'watering-soil-visual.js'
        ),
        target: 'watering-soil-visual.js'
      }
    ]
  ]
])

function shouldCopyForDeployment(sourceDirectory, sourcePath) {
  const relativePath = path.relative(sourceDirectory, sourcePath)
  if (!relativePath) {
    return true
  }
  const parts = relativePath.split(path.sep)
  if (parts.some(part => DEPLOYMENT_IGNORED_DIRECTORY_NAMES.has(part))) {
    return false
  }
  return !DEPLOYMENT_IGNORED_FILE_NAMES.has(path.basename(sourcePath))
}

export function stageFunctionPackage(sourceDirectory, functionName, deploymentId) {
  const stagingRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'planting-cloudbase-' + deploymentId + '-' + functionName + '-')
  )
  fs.cpSync(sourceDirectory, stagingRoot, {
    recursive: true,
    filter: sourcePath => shouldCopyForDeployment(sourceDirectory, sourcePath)
  })
  if (READER_SQL_RUNTIME_FUNCTIONS.has(functionName)) {
    if (!fs.existsSync(READER_SQL_RUNTIME_SOURCE)) {
      throw new Error(
        '读取 SQL 运行时缺失：' + path.relative(projectRoot, READER_SQL_RUNTIME_SOURCE)
      )
    }
    fs.copyFileSync(READER_SQL_RUNTIME_SOURCE, path.join(stagingRoot, 'read-sql-runtime-core.js'))
  }
  for (const runtimeFile of FUNCTION_BUNDLED_RUNTIME_FILES.get(functionName) || []) {
    if (!fs.existsSync(runtimeFile.source)) {
      throw new Error('函数运行时文件缺失：' + path.relative(projectRoot, runtimeFile.source))
    }
    fs.copyFileSync(runtimeFile.source, path.join(stagingRoot, runtimeFile.target))
  }
  return stagingRoot
}

export function installHttpFunctionDependencies(stagedDirectory, functionName) {
  const packageReport = inspectHttpFunctionPackage(functionName, stagedDirectory)
  if (packageReport.kind !== 'http_function') {
    return Promise.resolve({ ...packageReport, install_status: 'not_applicable' })
  }
  if (packageReport.violations.length) {
    throw new Error(
      'HTTP 云函数依赖包预检失败：' + functionName + ' ' + JSON.stringify(packageReport.violations)
    )
  }
  if (!packageReport.dependency_count) {
    console.log(
      'Skipping dependency install for HTTP function ' +
        functionName +
        ': no production dependencies'
    )
    return Promise.resolve({
      ...packageReport,
      install_status: 'skipped_no_production_dependencies'
    })
  }

  console.log('Installing production dependencies for HTTP function ' + functionName)
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['ci', '--omit=dev', '--ignore-scripts'], {
      cwd: stagedDirectory,
      env: process.env,
      stdio: 'inherit'
    })
    child.on('error', reject)
    child.on('exit', code => {
      if (code === 0) {
        resolve({ ...packageReport, install_status: 'installed' })
        return
      }
      reject(new Error('npm ci for HTTP function ' + functionName + ' exited with code ' + code))
    })
  })
}

export function verifyDiagnosisSplitArtifacts(targets = []) {
  if (!targets.some(target => DIAGNOSIS_SPLIT_FUNCTIONS.has(target.name))) {
    return Promise.resolve()
  }
  console.log('Verifying diagnosis split artifacts before staging')
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/build-diagnosis-http-splits.mjs', '--check'], {
      cwd: projectRoot,
      env: process.env,
      stdio: 'inherit'
    })
    child.on('error', reject)
    child.on('exit', code => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error('诊断分拆产物校验失败，退出码 ' + code))
    })
  })
}
