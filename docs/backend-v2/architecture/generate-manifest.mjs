import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const 当前目录 = path.dirname(fileURLToPath(import.meta.url))
const 项目根目录 = path.resolve(当前目录, '../../..')

const 文件 = {
  'README.md': path.join(项目根目录, 'README.md'),
  '青花植后端v2底层架构重构计划_融合闭环终版.md': path.join(项目根目录, '青花植后端v2底层架构重构计划_融合闭环终版.md'),
  'architecture/README.md': path.join(当前目录, 'README.md'),
  'business-domain.md': path.join(当前目录, 'business-domain.md'),
  'infrastructure.md': path.join(当前目录, 'infrastructure.md'),
  'business-to-technical-map.md': path.join(当前目录, 'business-to-technical-map.md'),
  'architecture-rules.md': path.join(当前目录, 'architecture-rules.md'),
  'configuration-and-providers.md': path.join(当前目录, 'configuration-and-providers.md'),
  'configuration-variable-catalog.json': path.join(当前目录, 'configuration-variable-catalog.json'),
  'configuration-variable-catalog.md': path.join(当前目录, 'configuration-variable-catalog.md'),
}

const manifest = {
  version: 'backend-architecture/v2-config-1',
  algorithm: 'sha256',
  files: Object.fromEntries(Object.entries(文件).map(([name, file]) => [
    name,
    createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
  ])),
}

fs.writeFileSync(path.join(当前目录, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
