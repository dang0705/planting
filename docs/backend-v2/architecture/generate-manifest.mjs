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
  'architecture/tropicals-api-mvp.md': path.join(当前目录, 'tropicals-api-mvp.md'),
  'care-decision-model.md': path.join(当前目录, 'care-decision-model.md'),
  'business-domain.md': path.join(当前目录, 'business-domain.md'),
  'business-domain-layers.md': path.join(当前目录, 'business-domain-layers.md'),
  'phases/first-release-scope.md': path.join(项目根目录, 'docs/backend-v2/phases/first-release-scope.md'),
  'contracts/diagnosis-rich-response-experiment.md': path.join(项目根目录, 'docs/backend-v2/contracts/diagnosis-rich-response-experiment.md'),
  'contracts/diagnosis-knowledge-sources.md': path.join(项目根目录, 'docs/backend-v2/contracts/diagnosis-knowledge-sources.md'),
  'contracts/diagnosis-outcome-fields.md': path.join(项目根目录, 'docs/backend-v2/contracts/diagnosis-outcome-fields.md'),
  'contracts/authenticated-ephemeral-plant-case.md': path.join(项目根目录, 'docs/backend-v2/contracts/authenticated-ephemeral-plant-case.md'),
  'contracts/care-environment-foundation.md': path.join(项目根目录, 'docs/backend-v2/contracts/care-environment-foundation.md'),
  'contracts/watering-decision-model.md': path.join(项目根目录, 'docs/backend-v2/contracts/watering-decision-model.md'),
  'contracts/plant-catalog-search.md': path.join(项目根目录, 'docs/backend-v2/contracts/plant-catalog-search.md'),
  'infrastructure.md': path.join(当前目录, 'infrastructure.md'),
  'business-to-technical-map.md': path.join(当前目录, 'business-to-technical-map.md'),
  'architecture-rules.md': path.join(当前目录, 'architecture-rules.md'),
  'configuration-and-providers.md': path.join(当前目录, 'configuration-and-providers.md'),
  'configuration-variable-catalog.json': path.join(当前目录, 'configuration-variable-catalog.json'),
  'configuration-variable-catalog.md': path.join(当前目录, 'configuration-variable-catalog.md'),
}

const readme = fs.readFileSync(文件['README.md'], 'utf8')
const 图正文 = (标题) => {
  const 章节 = readme.split(`## ${标题}\n`)[1]
  const mermaid = 章节?.match(/```mermaid\n([\s\S]*?)\n```/)?.[1]
  if (!mermaid) throw new Error(`缺少 ${标题} Mermaid 图`)
  return mermaid
}
const 哈希 = (内容) => createHash('sha256').update(内容).digest('hex')

const manifest = {
  version: 'backend-architecture/v2-config-2',
  algorithm: 'sha256',
  files: Object.fromEntries(Object.entries(文件).map(([name, file]) => [
    name,
    createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
  ])),
  diagrams: {
    business: 哈希(图正文('业务领域架构')),
    infrastructure: 哈希(图正文('后端基础设施架构')),
  },
}

fs.writeFileSync(path.join(当前目录, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
