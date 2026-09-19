#!/usr/bin/env node

/**
 * P0 外部能力卡片的双轴静态证伪门。
 * 独立 Expected 来源是 Master Plan P0/P13/P16.1：每张卡必须同时表达
 * 可由规格、官方资料或可执行本地检查证明的合同冻结状态，以及只能由
 * 真实/沙箱/真实测试库证明的集成准入状态。脚本不请求任何外部系统。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const cardPath = resolve('docs/backend-v2/decisions/P0-external-capability-cards.md');
const expectedCards = [
  ['P0-EXT-01', '游客盆土视觉'], ['P0-EXT-02', '游客会话认领'],
  ['P0-EXT-03', 'CloudBase 匿名身份'], ['P0-EXT-04', '百度植物识别'],
  ['P0-EXT-05', '和风天气'], ['P0-EXT-06', 'Qwen 诊断'],
  ['P0-EXT-07', 'Qwen 百科'], ['P0-EXT-08', '支付回调'],
  ['P0-EXT-09', 'Storage'], ['P0-EXT-10', 'CloudBase Agent'],
  ['P0-EXT-11', 'CMS 队列'], ['P0-EXT-12', 'CloudBase MySQL'],
  ['P0-EXT-13', '/api/v2 网关'], ['P0-EXT-14', 'outbox/inbox']
];
const requiredFields = [
  '卡片 ID', 'Owner', '输入 / 输出', '认证 / 权限', '超时 / 有限重试', '幂等', '费用',
  '隐私 / 日志', '失败隔离', '证据', '证据等级', '本地合同冻结结论',
  '真实集成准入结论', 'STOP 原因', 'GO 门'
];
const goCheckedFields = ['Owner', '输入 / 输出', '认证 / 权限', '超时 / 有限重试', '幂等', '费用', '隐私 / 日志', '失败隔离', '证据'];
const placeholderPattern = /待冻结|尚未|未知|TODO|TBD/i;

function parseCards(content) {
  return content.split(/^## /m).slice(1).map((section) => {
    const [title] = section.split('\n', 1);
    const body = section.slice(title.length);
    const fields = new Map();
    for (const field of requiredFields) {
      const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const match = body.match(new RegExp(`^- \\*\\*${escaped}\\*\\*：([^\\n]*)$`, 'm'));
      if (match) fields.set(field, match[1].trim());
    }
    return { title: title.trim(), fields };
  }).filter((card) => card.fields.has('卡片 ID'));
}

function validate(content) {
  const failures = [];
  if (content.includes('PENDING_EXTERNAL')) failures.push('禁止 PENDING_EXTERNAL：P0 卡只允许双轴 GO/STOP。');
  const cards = parseCards(content);
  const titles = new Set();
  const ids = new Set();
  for (const card of cards) {
    if (titles.has(card.title)) failures.push(`重复卡片标题：${card.title}`);
    titles.add(card.title);
    const id = card.fields.get('卡片 ID') ?? '';
    if (!/^P0-EXT-\d{2}$/.test(id)) failures.push(`${card.title} 的卡片 ID 非法：${id}`);
    if (ids.has(id)) failures.push(`重复卡片 ID：${id}`);
    ids.add(id);
    for (const field of requiredFields) if (!card.fields.get(field)) failures.push(`${card.title} 缺少或留空字段：${field}`);
    if (!/(^|\s|\+)S[1-4](?=\b|（)/.test(card.fields.get('证据等级') ?? '')) failures.push(`${card.title} 证据等级必须含 S1-S4。`);
    if (!/^CONTRACT_(GO|STOP) — \S/.test(card.fields.get('本地合同冻结结论') ?? '')) failures.push(`${card.title} 本地合同结论必须为 CONTRACT_GO/STOP 加原因。`);
    const integration = card.fields.get('真实集成准入结论') ?? '';
    const contract = card.fields.get('本地合同冻结结论') ?? '';
    if (!/^INTEGRATION_(GO|STOP) — \S/.test(integration)) failures.push(`${card.title} 真实集成结论必须为 INTEGRATION_GO/STOP 加原因。`);
    const evidence = card.fields.get('证据等级') ?? '';
    if (integration.startsWith('INTEGRATION_GO') && !/(^S4\b|S[1-3]\s*\+\s*(?:既有\s*)?S4\b|S4\s*\+\s*(?:既有\s*)?S[1-3]\b)/.test(evidence)) failures.push(`${card.title} 的 INTEGRATION_GO 必须有 S4 证据等级。`);
    if (contract.startsWith('CONTRACT_GO')) {
      for (const field of goCheckedFields) {
        if (placeholderPattern.test(card.fields.get(field) ?? '')) failures.push(`${card.title} 的 CONTRACT_GO 字段不得使用占位值：${field}`);
      }
    }
    const hasStop = contract.includes('CONTRACT_STOP') || integration.includes('INTEGRATION_STOP');
    if (hasStop && !card.fields.get('STOP 原因')) failures.push(`${card.title} 存在 STOP 但没有 STOP 原因。`);
  }
  for (const [id, title] of expectedCards) {
    const card = cards.find((item) => item.title === title);
    if (!card) failures.push(`缺少能力卡：${title}`);
    else if (card.fields.get('卡片 ID') !== id) failures.push(`${title} 的卡片 ID 必须是 ${id}`);
  }
  if (cards.length !== expectedCards.length) failures.push(`卡片数必须为 ${expectedCards.length}，实际为 ${cards.length}。`);
  return failures;
}

function report(failures) { for (const failure of failures) console.error(`- ${failure}`); }

const content = readFileSync(cardPath, 'utf8');
const mutations = {
  '--mutation-duplicate-id': () => content.replace('P0-EXT-01', 'P0-EXT-02'),
  '--mutation-fake-id': () => content.replace('P0-EXT-01', 'P0-EXT-99'),
  '--mutation-integration-go-s3': () => content.replace('- **真实集成准入结论**：INTEGRATION_STOP', '- **真实集成准入结论**：INTEGRATION_GO'),
  '--mutation-go-placeholder': () => content.replace('无供应商计费；本地合同只定义幂等与归属，不创建数据库连接或费用动作。', '待冻结'),
  '--mutation-remove-owner': () => content.replace('- **Owner**：`care`。', '- **Owner**：')
};
const mode = process.argv[2] ?? '';
if (mode in mutations) {
  const failures = validate(mutations[mode]());
  if (failures.length === 0) throw new Error(`负向变异未被捕获：${mode}`);
  console.error(`预期失败：${mode} 已被捕获。`);
  report(failures);
  process.exit(1);
}
if (mode === '--self-test') {
  for (const [name, mutate] of Object.entries(mutations)) {
    if (validate(mutate()).length === 0) throw new Error(`负向变异未被 verifier 捕获：${name}`);
  }
  console.log('PASS：重复 ID、伪 ID、INTEGRATION_GO+S3、GO 占位字段和 Owner 留空均会失败。');
  process.exit(0);
}
const failures = validate(content);
if (failures.length > 0) {
  console.error('P0 外部能力卡片静态门失败：');
  report(failures);
  process.exit(1);
}
console.log(`PASS：${expectedCards.length} 张卡均具备非空字段、唯一 ID/标题、双轴结论、证据等级与 STOP 原因。`);
