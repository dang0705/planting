import fs from 'node:fs'
import path from 'node:path'

export function readPagesManifest(repoRoot) {
  const source = fs.readFileSync(path.join(repoRoot, 'src/pages.json'), 'utf8')
  return JSON.parse(source.replace(/^\s*\/\/\s*#(?:if|endif|else).*$/gm, ''))
}
