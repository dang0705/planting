import { createHash } from 'node:crypto';
import { readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, resolve } from 'node:path';

// 这是只读的计划入口校验器：它不修改计划、代码、数据库或云端资源。
const 根目录 = resolve(new URL('../..', import.meta.url).pathname);
const 资料目录 = join(根目录, 'docs', 'backend-v2');
const 锁文件 = join(资料目录, 'BASELINE.lock');
const 导航文件 = join(资料目录, 'README.md');
const 正文文件 = join(根目录, '青花植后端v2底层架构重构计划_融合闭环终版.md');
const 进度文件 = join(资料目录, 'tracker', 'module-status.json');
const 代理职责文件 = join(资料目录, 'agents', 'agent-ownership.md');
const 任务索引文件 = join(资料目录, 'clickup', 'ticket-index.md');

const 读取 = (文件) => readFile(文件, 'utf8');
const sha256 = (内容) => createHash('sha256').update(内容).digest('hex');
const 失败 = (消息) => {
  console.error(`BLOCKED_PLAN_BASELINE: ${消息}`);
  process.exitCode = 1;
};

const [锁内容, 导航内容, 正文内容, 进度内容, 代理职责内容, 任务索引内容] = await Promise.all([
  读取(锁文件),
  读取(导航文件),
  读取(正文文件),
  读取(进度文件),
  读取(代理职责文件),
  读取(任务索引文件),
]);

const 标题 = 锁内容.match(/基线标题:\s*(.+)/)?.[1]?.trim();
const 期望哈希 = 锁内容.match(/基线 SHA-256:\s*`?([a-f0-9]{64})`?/i)?.[1];
const 期望行数 = Number(锁内容.match(/基线行数:\s*(\d+)/)?.[1]);
const 实际行数 = 正文内容.split(/\r?\n/).length - (正文内容.endsWith('\n') ? 1 : 0);

if (!导航内容.includes('唯一发现入口') || !导航内容.includes('唯一计划正文')) {
  失败('README 未声明发现入口与计划正文的角色边界');
}
if (!正文内容.startsWith(`# ${标题}`)) {
  失败('Master Plan 标题不匹配');
}
if (实际行数 !== 期望行数) {
  失败(`Master Plan 行数不匹配：实际 ${实际行数}，锁定 ${期望行数}`);
}
if (sha256(正文内容) !== 期望哈希) {
  失败('Master Plan SHA-256 不匹配');
}

const 必须登记的代理 = [
  'audit_legacy_code_luna',
  'audit_data_cms_luna',
  'audit_external_sources_luna',
  'audit_storage_memory_luna',
  'taxonomy_inventory_luna',
  'identity_review_luna',
  'security_review_terra',
  'real_db_runner_luna',
  'real_api_runner_luna',
  'docs_diff_luna',
  'foundation_terra',
  'identity_terra',
  'subscription_terra',
  'knowledge_terra',
  'user_plant_terra',
  'care_terra',
  'diagnosis_terra',
];
for (const 代理 of 必须登记的代理) {
  if (!代理职责内容.includes(`\`${代理}\``)) {
    失败(`代理职责表未登记：${代理}`);
  }
  if (!任务索引内容.includes(`| ${代理} |`)) {
    // ClickUp 尚未连接时，至少要有预创建索引；P-1 之外的代理也必须有 ticket 行。
    失败(`ClickUp ticket 索引未登记负责人：${代理}`);
  }
}
try {
  const 进度 = JSON.parse(进度内容);
  if (!Array.isArray(进度.modules)) {
    失败('tracker/module-status.json 缺少 modules 数组');
  }
  if (!Array.isArray(进度.agentRegistry)) {
    失败('tracker/module-status.json 缺少当前子代理快照 agentRegistry');
  }
  if (!进度.clickUpTaskStatuses || typeof 进度.clickUpTaskStatuses !== 'object') {
    失败('tracker/module-status.json 缺少 ClickUp 任务状态快照');
  }
  const 当前子代理 = new Set((进度.agentRegistry || []).map((代理) => 代理.name).filter(Boolean));
  const 已见任务 = new Set();
  for (const 模块 of 进度.modules || []) {
    for (const 任务 of 模块.tickets || []) {
      if (!任务.id || 已见任务.has(任务.id)) {
        失败(`tracker 任务 ID 缺失或重复：${任务.id || '未命名任务'}`);
      }
      已见任务.add(任务.id);
      if (!(任务.id in (进度.clickUpTaskStatuses || {}))) {
        失败(`tracker 未登记 ClickUp 状态：${任务.id}`);
      }
      if (任务.agent && !当前子代理.has(任务.agent)) {
        失败(`tracker 任务负责人不在当前子代理快照：${任务.id} -> ${任务.agent}`);
      }
      if (任务.agent && 进度.clickUpTaskStatuses?.[任务.id] === 'backlog' && !String(任务.status || '').includes('CLICKUP_BLOCKED')) {
        失败(`ClickUp 仍为 backlog 但任务未标记 CLICKUP_BLOCKED：${任务.id}`);
      }
    }
  }
} catch (错误) {
  失败(`进度数据不是有效 JSON：${错误.message}`);
}

for (const 相对路径 of [
  'architecture/README.md',
  'contracts/README.md',
  'data/README.md',
  'implementation/README.md',
  'testing/README.md',
  'phases/INDEX.md',
  'clickup/README.md',
  'tracker/index.html',
]) {
  try {
    await access(join(资料目录, 相对路径), constants.R_OK);
  } catch {
    失败(`渐进式入口不存在或不可读：${相对路径}`);
  }
}

if (process.exitCode !== 1) {
  console.log(`入口校验通过：${标题}，${实际行数} 行，SHA-256 ${sha256(正文内容)}`);
}
