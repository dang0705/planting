import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { repoRoot } from './state.mjs'

const EXECUTION_BUNDLE_EXTENSIONS = Object.freeze(['.mjs', '.js', '.cjs', '.json'])

function normalize(value) {
  return String(value ?? '')
    .replaceAll('\\\\', '/')
    .replace(/^\.\//, '')
}

function isWhitespace(char) {
  return ' \t\n\r\f\v'.includes(char)
}

function isIdentifierStart(char) {
  return Boolean(char) && /[A-Za-z_$]/.test(char)
}

function isIdentifierPart(char) {
  return Boolean(char) && /[A-Za-z0-9_$]/.test(char)
}

function skipTrivia(source, start) {
  let index = start
  while (index < source.length) {
    if (isWhitespace(source[index])) {
      index += 1
      continue
    }
    if (source.startsWith('//', index)) {
      const lineEnd = source.indexOf('\n', index + 2)
      index = lineEnd === -1 ? source.length : lineEnd + 1
      continue
    }
    if (source.startsWith('/*', index)) {
      const commentEnd = source.indexOf('*/', index + 2)
      if (commentEnd === -1) {
        throw new Error('unterminated block comment while reading static ESM imports')
      }
      index = commentEnd + 2
      continue
    }
    break
  }
  return index
}

function skipQuotedText(source, start) {
  const quote = source[start]
  let index = start + 1
  while (index < source.length) {
    if (source[index] === '\\') {
      index += 2
      continue
    }
    if (source[index] === quote) {
      return index + 1
    }
    index += 1
  }
  throw new Error('unterminated string while reading static ESM imports')
}

function readQuotedSpecifier(source, start) {
  const quote = source[start]
  let value = ''
  let index = start + 1
  while (index < source.length) {
    const char = source[index]
    if (char === '\\') {
      if (index + 1 >= source.length) {
        throw new Error('unterminated escaped static ESM import specifier')
      }
      value += source[index + 1]
      index += 2
      continue
    }
    if (char === quote) {
      return { specifier: value, end: index + 1 }
    }
    value += char
    index += 1
  }
  throw new Error('unterminated static ESM import specifier')
}

function readIdentifier(source, start) {
  let index = start + 1
  while (isIdentifierPart(source[index])) {
    index += 1
  }
  return { word: source.slice(start, index), end: index }
}

function readSpecifierAfterFrom(source, start) {
  let index = start
  let depth = 0
  while (index < source.length) {
    index = skipTrivia(source, index)
    const char = source[index]
    if (!char) {
      return null
    }
    if (char === "'" || char === '"' || char === '`') {
      index = skipQuotedText(source, index)
      continue
    }
    if (char === '{' || char === '[' || char === '(') {
      depth += 1
      index += 1
      continue
    }
    if (char === '}' || char === ']' || char === ')') {
      depth = Math.max(0, depth - 1)
      index += 1
      continue
    }
    if (char === ';' && depth === 0) {
      return null
    }
    if (isIdentifierStart(char)) {
      const token = readIdentifier(source, index)
      if (depth === 0 && token.word === 'from') {
        const specifierStart = skipTrivia(source, token.end)
        if (source[specifierStart] === "'" || source[specifierStart] === '"') {
          return readQuotedSpecifier(source, specifierStart)
        }
      }
      index = token.end
      continue
    }
    index += 1
  }
  return null
}

function isRegexStart(source, index) {
  let cursor = index - 1
  while (cursor >= 0 && isWhitespace(source[cursor])) {
    cursor -= 1
  }
  const previous = source[cursor] ?? ''
  return !previous || '([{=,:;!&|?+-*%^~<>'.includes(previous)
}

function skipRegexLiteral(source, start) {
  let index = start + 1
  let inCharacterClass = false
  while (index < source.length) {
    if (source[index] === '\\') {
      index += 2
      continue
    }
    if (source[index] === '[') {
      inCharacterClass = true
    } else if (source[index] === ']') {
      inCharacterClass = false
    } else if (source[index] === '/' && !inCharacterClass) {
      index += 1
      while (/[A-Za-z]/.test(source[index] ?? '')) {
        index += 1
      }
      return index
    }
    index += 1
  }
  return source.length
}

export function staticEsmSpecifiers(source) {
  const specifiers = []
  let index = 0
  let nesting = 0
  while (index < source.length) {
    index = skipTrivia(source, index)
    const char = source[index]
    if (!char) {
      break
    }
    if (char === "'" || char === '"' || char === '`') {
      index = skipQuotedText(source, index)
      continue
    }
    if (char === '/' && isRegexStart(source, index)) {
      index = skipRegexLiteral(source, index)
      continue
    }
    if (char === '{') {
      nesting += 1
      index += 1
      continue
    }
    if (char === '}') {
      nesting = Math.max(0, nesting - 1)
      index += 1
      continue
    }
    if (nesting === 0 && isIdentifierStart(char)) {
      const token = readIdentifier(source, index)
      if (token.word === 'import') {
        const specifierStart = skipTrivia(source, token.end)
        if (source[specifierStart] !== '(' && source[specifierStart] !== '.') {
          if (source[specifierStart] === "'" || source[specifierStart] === '"') {
            const direct = readQuotedSpecifier(source, specifierStart)
            specifiers.push(direct.specifier)
            index = direct.end
            continue
          }
          const from = readSpecifierAfterFrom(source, specifierStart)
          if (from) {
            specifiers.push(from.specifier)
            index = from.end
            continue
          }
        }
      } else if (token.word === 'export') {
        const from = readSpecifierAfterFrom(source, token.end)
        if (from) {
          specifiers.push(from.specifier)
          index = from.end
          continue
        }
      }
      index = token.end
      continue
    }
    index += 1
  }
  return specifiers
}

function pathInside(root, candidate) {
  const relative = path.relative(root, candidate)
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  )
}

function relativeLabel(root, file) {
  return normalize(path.relative(root, file))
}

function requireInsideRoot(root, candidate, detail) {
  if (!pathInside(root, candidate)) {
    throw new Error(`execution bundle import escapes root: ${detail}`)
  }
}

function resolveRelativeImport({ root, realRoot, importer, specifier }) {
  const unresolved = path.resolve(path.dirname(importer), specifier)
  requireInsideRoot(root, unresolved, `${specifier} from ${relativeLabel(root, importer)}`)
  const candidates = [unresolved]
  if (!path.extname(unresolved)) {
    for (const extension of EXECUTION_BUNDLE_EXTENSIONS) {
      candidates.push(`${unresolved}${extension}`)
      candidates.push(path.join(unresolved, `index${extension}`))
    }
  }
  for (const candidate of candidates) {
    requireInsideRoot(root, candidate, `${specifier} from ${relativeLabel(root, importer)}`)
    if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) {
      continue
    }
    const resolved = fs.realpathSync(candidate)
    requireInsideRoot(
      realRoot,
      resolved,
      `${specifier} from ${relativeLabel(root, importer)} resolves outside the root`
    )
    return resolved
  }
  throw new Error(
    `cannot resolve relative static ESM import ${JSON.stringify(specifier)} from ${relativeLabel(
      root,
      importer
    )}`
  )
}

export function resolveExecutionBundle(leafScript, { rootDir = repoRoot, additionalFiles = [] } = {}) {
  const root = path.resolve(rootDir)
  const realRoot = fs.realpathSync(root)
  const unresolvedLeaf = path.resolve(root, leafScript)
  requireInsideRoot(root, unresolvedLeaf, String(leafScript))
  if (!fs.existsSync(unresolvedLeaf) || !fs.statSync(unresolvedLeaf).isFile()) {
    throw new Error(`execution bundle leaf does not exist: ${relativeLabel(root, unresolvedLeaf)}`)
  }
  const entry = fs.realpathSync(unresolvedLeaf)
  requireInsideRoot(realRoot, entry, String(leafScript))
  const filesByRelativePath = new Map()
  const visiting = []
  const visited = new Set()
  const visit = file => {
    const relative = relativeLabel(realRoot, file)
    const cycleStart = visiting.indexOf(relative)
    if (cycleStart !== -1) {
      throw new Error(
        `circular relative static ESM import: ${[...visiting.slice(cycleStart), relative].join(' -> ')}`
      )
    }
    if (visited.has(relative)) {
      return
    }
    visiting.push(relative)
    filesByRelativePath.set(relative, file)
    const source = fs.readFileSync(file, 'utf8')
    for (const specifier of staticEsmSpecifiers(source)) {
      if (
        specifier.startsWith('node:') ||
        (!specifier.startsWith('.') && !specifier.startsWith('/') && !specifier.startsWith('file:'))
      ) {
        continue
      }
      if (specifier.startsWith('/') || specifier.startsWith('file:')) {
        throw new Error(
          `execution bundle only permits relative local ESM imports: ${specifier} from ${relative}`
        )
      }
      visit(resolveRelativeImport({ root, realRoot, importer: file, specifier }))
    }
    visiting.pop()
    visited.add(relative)
  }
  visit(entry)
  for (const additionalFile of additionalFiles) {
    const relativeAdditionalFile = normalize(additionalFile)
    if (!relativeAdditionalFile || path.isAbsolute(relativeAdditionalFile)) {
      throw new Error(`execution bundle integrity file must be a relative path: ${additionalFile}`)
    }
    const unresolved = path.resolve(root, relativeAdditionalFile)
    requireInsideRoot(root, unresolved, relativeAdditionalFile)
    if (!fs.existsSync(unresolved) || !fs.statSync(unresolved).isFile()) {
      throw new Error(`execution bundle integrity file does not exist: ${relativeAdditionalFile}`)
    }
    const resolved = fs.realpathSync(unresolved)
    requireInsideRoot(
      realRoot,
      resolved,
      `${relativeAdditionalFile} resolves outside the execution bundle root`
    )
    filesByRelativePath.set(relativeLabel(realRoot, resolved), resolved)
  }
  return [...filesByRelativePath.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([relative, file]) => ({ path: relative, file }))
}

export function executionBundleFingerprint(leafScript, options = {}) {
  const files = resolveExecutionBundle(leafScript, options)
  const hash = crypto.createHash('sha256')
  for (const entry of files) {
    hash.update(entry.path)
    hash.update('\0')
    hash.update(fs.readFileSync(entry.file))
    hash.update('\0')
  }
  return {
    hash: hash.digest('hex'),
    files: files.map(entry => entry.path)
  }
}
