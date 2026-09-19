import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const 当前目录 = path.dirname(fileURLToPath(import.meta.url))
const 数据路径 = path.join(当前目录, 'configuration-variable-catalog.json')
const 输出路径 = path.join(当前目录, 'configuration-variable-catalog.md')
const 目录 = JSON.parse(fs.readFileSync(数据路径, 'utf8'))

const 领域名称 = {
  identity: '身份与访问主体',
  subscription: '权益、会员、积分与 AI 额度',
  'user-plant': '用户植物',
  'plant-knowledge': '植物知识、分类与 CMS',
  care: '养护、天气与算法',
  diagnosis: '问诊与视觉 AI',
  storage: '云存储与数据生命周期',
  http: 'HTTP 公共合同',
  'reliable-events': '可靠事件',
  observability: '性能、成本与可观测性',
  configuration: '配置治理与部署',
}

const 状态名称 = { confirmed: '已冻结', pending: '待冻结', hard_rule: '不可配置硬规则' }
const 层级名称 = {
  domain_policy: '领域策略',
  provider_runtime: '第三方运行配置',
  deployment_secret: '部署/受控环境',
  hard_rule: '不可配置硬规则',
}

function 显示值(value) {
  if (typeof value === 'string') return value
  return `\`${JSON.stringify(value)}\``
}

const lines = [
  '# 青花植后端 v2 业务关键变量目录',
  '',
  `- 机器事实源：\`configuration-variable-catalog.json\``,
  `- Schema：\`${目录.schemaVersion}\``,
  `- 目录版本：\`${目录.catalogVersion}\``,
  `- 当前共 ${目录.variables.length} 项业务/治理变量、${目录.providerProfiles.length} 个 Provider 配置档案：已冻结 ${目录.variables.filter((x) => x.status === 'confirmed').length} 项、待冻结 ${目录.variables.filter((x) => x.status === 'pending').length} 项、不可配置硬规则 ${目录.variables.filter((x) => x.status === 'hard_rule').length} 项。`,
  '',
  '本文件由同目录生成脚本从 JSON 生成，便于中文阅读。实施 Agent 必须先按领域读取本文件，再只深读该变量引用的合同或决策；不得把 `P1_PENDING` 猜成默认值。待冻结项必须带原因与阻断范围，未冻结前只能推进不依赖该值的工作。',
  '',
  '## 读取与变更规则',
  '',
  '1. `已冻结`：实现必须从类型化不可变策略或受控部署配置读取，不得另写隐式常量。',
  '2. `待冻结`：只能补证据、合同和测试；其 `blockingScope` 对应功能禁止进入实现或发布。',
  '3. `不可配置硬规则`：必须由代码、数据库约束和测试共同保证，任何 CMS、数据库策略或环境变量都不能覆盖。',
  '4. 每次变更必须同步 JSON、重新生成本文件、更新架构 SHA-256 清单，并执行 P1 配置架构测试。',
  '',
]

lines.push('## Expected 与测试边界', '')
lines.push('目录的静态校验元数据明确说明 Expected 的来源、已覆盖范围和未覆盖范围；不得把本地目录校验误报为真实 Provider 或 CloudBase 验收。')
lines.push('')
lines.push('| 对象 | 测试层次 | Expected 来源 | 已覆盖 | 明确未覆盖 |')
lines.push('|---|---|---|---|---|')
for (const [kind, metadata] of Object.entries(目录.validationMetadata)) {
  lines.push(`| ${kind} | ${metadata.level} | ${metadata.expectedSource} | ${metadata.coverage} | ${metadata.notCovered} |`)
}
lines.push('')

lines.push('## 配置化裁决组', '')
lines.push('主代理先按以下裁决组比较真实变化来源、收益和复杂度，再决定变量是否配置化。领域子代理只能提交证据，不能自行扩大配置范围。')
lines.push('')
lines.push('| 裁决组 | 决定 | 真实变化来源 | 收益 | 复杂度判断 |')
lines.push('|---|---|---|---|---|')
for (const [code, group] of Object.entries(目录.configurationDecisionGroups)) {
  lines.push(`| \`${code}\` | ${group.decision} | ${group.realChangeSource} | ${group.benefit} | ${group.complexity} |`)
}
lines.push('')

for (const [domain, title] of Object.entries(领域名称)) {
  const items = 目录.variables.filter((item) => item.domain === domain)
  if (items.length === 0) continue
  lines.push(`## ${title}`, '')
  lines.push('| 配置 ID | 中文名称 | 裁决组 | 层级 / 状态 | 当前值 | 所有者 | 消费方 | 变更与失败边界 | Phase / Ticket |')
  lines.push('|---|---|---|---|---|---|---|---|---|')
  for (const item of items) {
    const value = 显示值(item.currentValue).replaceAll('|', '\\|')
    const boundary = `${item.changePolicy}；失败：${item.fallback}${item.pendingReason ? `；待冻结原因：${item.pendingReason}；阻断：${item.blockingScope}` : ''}`.replaceAll('|', '\\|')
    lines.push(`| \`${item.id}\` | ${item.chineseName} | \`${item.decisionGroup}\` | ${层级名称[item.layer]} / ${状态名称[item.status]} | ${value}${item.unit ? ` ${item.unit}` : ''} | ${item.owner} | ${item.consumers.join('、')} | ${boundary} | ${item.phase} / ${item.ticketTitle} |`)
  }
  lines.push('')
}

lines.push('## 首批 Provider 逐项配置档案', '')
lines.push('以下每个档案都显式登记同一组运行字段。`P1_PENDING` 表示该字段没有事实依据，不能由 Adapter 自行填默认值；`not_applicable_or_P1_PENDING` 表示必须先裁决是否适用。')
lines.push('')
lines.push('| Provider | 能力 | 状态 | 端点 / 凭证 | 超时 / 重试 | 限流 / 熔断 | 成本 / 预算 | 回退与阻断 |')
lines.push('|---|---|---|---|---|---|---|---|')
for (const profile of 目录.providerProfiles) {
  const endpoint = `${profile.endpointProfile} / ${profile.credentialRef}`
  const timeouts = `connect=${profile.connectTimeoutMs}, read=${profile.readTimeoutMs}, total=${profile.totalDeadlineMs}, attempts=${profile.maxAttempts}, backoff=${profile.backoffPolicy}`
  const guard = `rate=${profile.rateLimitPolicy}, circuit=${profile.circuitBreakerPolicy}`
  const cost = `policy=${profile.costPolicy}, month=${profile.monthlyBudgetCny}, warn=${profile.warningThresholdCny}`
  lines.push(`| \`${profile.providerCode}\` ${profile.chineseName} | ${profile.capabilityCodes.join('、')} | ${profile.status} | ${endpoint} | ${timeouts} | ${guard} | ${cost} | ${profile.fallback}；阻断：${profile.blockingScope} |`)
}
lines.push('')

lines.push('## 验收方式', '')
lines.push('- 机器目录中每项必须有唯一 ID、中文名称、领域、层级、类型、状态、当前值、owner、来源、消费方、变更规则、失败边界、阶段、Ticket 与 Expected。')
lines.push('- `pending` 必须额外具备 `pendingReason` 与 `blockingScope`；对应范围在值冻结前不得实现。')
lines.push('- 目录必须覆盖身份、权益、用户植物、植物知识、养护、问诊、存储、HTTP、可靠事件、可观测性和配置治理。')
lines.push('- 首批 Provider 必须逐个具备端点档案、凭证引用、连接/读取/总超时、重试与退避、限流、熔断、成本/预算、回退链、输出合同、审计保留和阻断范围；待冻结字段不得进入真实 Adapter。')
lines.push('- 任何代码新增可调常量时，先判断其是否属于本目录；属于则先修改策略合同和测试，不允许先埋常量。')
lines.push('')

fs.writeFileSync(输出路径, `${lines.join('\n')}\n`)
