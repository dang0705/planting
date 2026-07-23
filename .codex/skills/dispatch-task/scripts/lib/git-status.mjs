import fs from 'node:fs'

export const normalizeGitPath = file =>
  String(file ?? '')
    .replaceAll('\\', '/')
    .replace(/^\.\//, '')

const splitNulRecords = buffer => {
  const source = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer ?? '')
  const records = []
  let start = 0
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === 0) {
      records.push(source.subarray(start, index))
      start = index + 1
    }
  }
  if (start < source.length) {
    records.push(source.subarray(start))
  }
  return records.filter(record => record.length > 0)
}

const isRenameOrCopy = status => status.includes('R') || status.includes('C')

export function parsePorcelainV1Z(buffer) {
  const records = splitNulRecords(buffer)
  const entries = []
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]
    if (record.length < 4) {
      continue
    }
    const status = record.subarray(0, 2).toString('ascii')
    const filePath = normalizeGitPath(record.subarray(3).toString('utf8'))
    if (!filePath) {
      continue
    }
    const entry = { status, path: filePath, raw_path: filePath }
    if (isRenameOrCopy(status) && records[index + 1]) {
      index += 1
      entry.original_path = normalizeGitPath(records[index].toString('utf8'))
    }
    entries.push(entry)
    if (entry.original_path) {
      entries.push({
        status,
        path: entry.original_path,
        raw_path: entry.original_path,
        renamed_or_copied_from: true
      })
    }
  }
  return entries
}

const escapedByte = value => {
  if (typeof value !== 'string' || value.length === 0) {
    return null
  }
  const code = value.charCodeAt(0)
  return Number.isFinite(code) ? code : null
}

export function decodeGitQuotedPath(rawPath) {
  const raw = String(rawPath ?? '')
  if (raw.length < 2 || !raw.startsWith('"') || !raw.endsWith('"')) {
    return null
  }
  const body = raw.slice(1, -1)
  const bytes = []
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index]
    if (char !== '\\') {
      bytes.push(...Buffer.from(char, 'utf8'))
      continue
    }
    const next = body[index + 1]
    const octal = body.slice(index + 1, index + 4)
    if (/^[0-7]{3}$/.test(octal)) {
      bytes.push(Number.parseInt(octal, 8))
      index += 3
      continue
    }
    const escaped =
      {
        a: 7,
        b: 8,
        f: 12,
        n: 10,
        r: 13,
        t: 9,
        v: 11,
        '"': 34,
        '\\': 92
      }[next] ?? escapedByte(next)
    if (escaped === null) {
      return null
    }
    bytes.push(escaped)
    index += 1
  }
  const decoded = Buffer.from(bytes).toString('utf8')
  return decoded.includes('\uFFFD') ? null : normalizeGitPath(decoded)
}

const uniqueSorted = paths => [...new Set(paths.map(normalizeGitPath).filter(Boolean))].sort()

export function canonicalizeLegacyQuotedBaseline(
  baseline,
  { currentStatusEntries = [], getFingerprint, getMtimeMs = file => fs.statSync(file).mtimeMs } = {}
) {
  const errors = []
  const canonicalizations = []
  const capturedAtMs = Date.parse(baseline?.captured_at ?? '')
  if (!Number.isFinite(capturedAtMs)) {
    return { baseline, canonicalizations, errors: ['baseline.captured_at is invalid'] }
  }
  const currentByPath = new Map(
    currentStatusEntries.map(entry => [normalizeGitPath(entry.path), entry])
  )
  const replacements = new Map()
  for (const entry of baseline?.status_entries ?? []) {
    const originalPath = normalizeGitPath(entry.path)
    const canonicalPath = decodeGitQuotedPath(entry.raw_path)
    if (!canonicalPath || canonicalPath === originalPath) {
      continue
    }
    const current = currentByPath.get(canonicalPath)
    const mtimeMs = (() => {
      try {
        return getMtimeMs(canonicalPath)
      } catch {
        return null
      }
    })()
    if (
      !current ||
      current.status !== entry.status ||
      !Number.isFinite(mtimeMs) ||
      mtimeMs > capturedAtMs
    ) {
      errors.push(`cannot safely canonicalize legacy quoted baseline path: ${originalPath}`)
      continue
    }
    replacements.set(originalPath, canonicalPath)
    canonicalizations.push({
      from: originalPath,
      path: canonicalPath,
      raw_path: entry.raw_path,
      mtime_ms: mtimeMs,
      captured_at: baseline.captured_at
    })
  }
  if (!replacements.size || errors.length) {
    return { baseline, canonicalizations, errors }
  }
  const canonicalEntries = (baseline.status_entries ?? []).map(entry => {
    const originalPath = normalizeGitPath(entry.path)
    const canonicalPath = replacements.get(originalPath)
    if (!canonicalPath) {
      return entry
    }
    return {
      ...entry,
      path: canonicalPath,
      raw_path: canonicalPath,
      legacy_raw_path: entry.raw_path
    }
  })
  const canonicalFingerprints = (baseline.dirty_file_fingerprints ?? []).map(entry => {
    const canonicalPath = replacements.get(normalizeGitPath(entry.path))
    if (!canonicalPath) {
      return entry
    }
    if (typeof getFingerprint !== 'function') {
      errors.push(`cannot rebuild canonical baseline fingerprint: ${canonicalPath}`)
      return entry
    }
    return getFingerprint(canonicalPath)
  })
  if (errors.length) {
    return { baseline, canonicalizations, errors }
  }
  return {
    baseline: {
      ...baseline,
      status_files: uniqueSorted(
        (baseline.status_files ?? []).map(file => replacements.get(normalizeGitPath(file)) ?? file)
      ),
      status_entries: canonicalEntries,
      dirty_file_fingerprints: canonicalFingerprints
    },
    canonicalizations,
    errors
  }
}
