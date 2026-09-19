import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { parseArgs, requireContentId } from './args.mjs';
import { workflowPaths } from './paths.mjs';
import { nextSequence, pad3 } from './sequence.mjs';
import { validatePlanContract } from './plan-contract.mjs';
import { hashFile } from './hash.mjs';
import { loadState, saveState } from './state.mjs';
import { writePlanDiagram } from './mermaid.mjs';

const args = parseArgs();
const contentId = requireContentId(args.get('--content'));
const draftArg = args.get('--draft');

if (!draftArg) throw new Error('缺少 --draft，例如 draft-003.json');

const paths = workflowPaths(contentId);
const draftName = basename(draftArg.endsWith('.json') ? draftArg : `${draftArg}.json`);
const draftPath = resolve(paths.drafts, draftName);

// 强制 Draft 只能来自当前 content 的 drafts 目录。
if (!draftPath.startsWith(paths.drafts)) {
  throw new Error('只能批准当前 content 的 drafts 目录中的文件');
}

const sourceDraftMetaPath = draftPath.replace(/\.json$/, '.meta.json');
let sourceDraftMeta;

try {
  sourceDraftMeta = JSON.parse(
    await readFile(sourceDraftMetaPath, 'utf8')
  );
} catch (error) {
  if (error.code === 'ENOENT') {
    throw new Error(
      'Draft 缺少 canonical meta，不能批准。请先通过 video:draft:create 导入或重建该 Plan。'
    );
  }
  throw new Error(`Draft meta 无法读取：${error.message}`);
}

const draftId = draftName.replace(/\.json$/, '');

if (sourceDraftMeta.status !== 'draft_valid') {
  throw new Error(
    `Draft meta 状态不是 draft_valid：${sourceDraftMeta.status ?? 'missing'}`
  );
}

if (sourceDraftMeta.contentId !== contentId) {
  throw new Error(
    `Draft meta contentId 不匹配：期望 ${contentId}，实际 ${sourceDraftMeta.contentId}`
  );
}

if (sourceDraftMeta.draftId !== draftId) {
  throw new Error(
    `Draft meta draftId 不匹配：期望 ${draftId}，实际 ${sourceDraftMeta.draftId}`
  );
}

const planHash = await hashFile(draftPath);

if (!sourceDraftMeta.draftSha256) {
  throw new Error(
    'Draft meta 缺少 draftSha256；该 Draft 不是 canonical Draft。请通过 video:draft:create 重新导入。'
  );
}

if (sourceDraftMeta.draftSha256 !== planHash) {
  throw new Error(
    'Draft 内容与 meta.draftSha256 不一致，拒绝批准；请创建新的 Draft，不要原地修改。'
  );
}

const plan = JSON.parse(await readFile(draftPath, 'utf8'));
const validation = await validatePlanContract(plan, contentId);

if (validation.errors.length) {
  throw new Error(
    `Draft 校验失败：\n${validation.errors.map(x => `- ${x}`).join('\n')}`
  );
}

const state = await loadState(paths.state, contentId);

if (state.currentApproval?.planHash === planHash) {
  console.log(`当前 Approved 已是同一份内容：${state.currentApproval.approvalId}`);
  process.exit(0);
}

const seq = await nextSequence(paths.approved, 'approval-');
const approvalId = `approval-${pad3(seq)}`;
const approvalDir = resolve(paths.approved, approvalId);

await import('node:fs/promises').then(({ mkdir }) =>
  mkdir(approvalDir, { recursive: true })
);

const approvedPlan = resolve(approvalDir, 'plan.json');
await copyFile(draftPath, approvedPlan);

await copyFile(
  sourceDraftMetaPath,
  resolve(approvalDir, 'source-draft-meta.json')
);
const sourceDraftMetaHash = await hashFile(sourceDraftMetaPath);

await writePlanDiagram(plan, {
  mermaidPath: resolve(approvalDir, 'plan.mmd'),
  markdownPath: resolve(approvalDir, 'plan.md')
});

const approvedHash = await hashFile(approvedPlan);
const meta = {
  approvalId,
  contentId,
  sourceDraft: draftName,
  sourceDraftMetaHash,
  producer: sourceDraftMeta?.producer ?? null,
  skillUsage: sourceDraftMeta?.skillUsage ?? null,
  planHash: approvedHash,
  approvedAt: new Date().toISOString()
};

await writeFile(
  resolve(approvalDir, 'meta.json'),
  JSON.stringify(meta, null, 2),
  'utf8'
);

state.currentApproval = {
  approvalId,
  planPath: approvedPlan,
  planHash: approvedHash,
  approvedAt: meta.approvedAt
};

// 批准新的 Plan 后，已有 Prepared Job 失去资格。
state.currentJob = null;
state.currentRender = null;
state.lastPrepare = null;

await saveState(paths.state, state);

console.log(`已批准：${approvalId}`);
console.log(`来源 Draft：${draftName}`);
console.log('Approved 计划是不可变快照；需要修改时请生成/派生新的 Draft。');
