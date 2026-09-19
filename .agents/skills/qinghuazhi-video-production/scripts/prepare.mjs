import { workspacePath, resolveWorkspaceRelative } from './workspace.mjs';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs, requireContentId } from './args.mjs';
import { workflowPaths } from './paths.mjs';
import { nextSequence, pad3 } from './sequence.mjs';
import { loadState, saveState } from './state.mjs';
import { hashFile, hashObject } from './hash.mjs';
import { loadCatalog, resolveVisual } from './asset-resolver.mjs';

const args = parseArgs();
const contentId = requireContentId(args.get('--content'));
const paths = workflowPaths(contentId);
const state = await loadState(paths.state, contentId);

if (!state.currentApproval) {
  throw new Error('没有 Approved 计划。先执行 video:approve');
}

// 审批快照必须未被篡改。
const actualPlanHash = await hashFile(state.currentApproval.planPath);
if (actualPlanHash !== state.currentApproval.planHash) {
  throw new Error('Approved plan 哈希变化，拒绝 Prepare');
}

const build = spawnSync(
  process.execPath,
  [fileURLToPath(new URL('./build-catalog.mjs', import.meta.url))],
  { stdio: 'inherit', env: process.env }
);
if (build.status !== 0) throw new Error('Asset Catalog 构建失败');

const catalog = await loadCatalog();
const plan = JSON.parse(await readFile(state.currentApproval.planPath, 'utf8'));
const project = JSON.parse(await readFile(workspacePath('config', 'project.json'), 'utf8'));

const resolvedShots = [];
const missing = [];

for (const scene of plan.scenes) {
  for (const shot of scene.shots) {
    const result = resolveVisual(shot.visual, catalog);

    if (result.status !== 'resolved') {
      missing.push({
        sceneId: scene.id,
        shotId: shot.id,
        requirement: shot.visual
      });
      continue;
    }

    const assetPath = resolveWorkspaceRelative(result.asset.path);
    const assetHash = await hashFile(assetPath);

    let voice = shot.speech.voice;
    if (!voice && shot.speech.mode !== 'none') {
      voice =
        project.voices[result.asset.gender] ??
        project.voices.default;
    }

    resolvedShots.push({
      sceneId: scene.id,
      scenePurpose: scene.purpose,
      shotId: shot.id,
      type: shot.type,
      assetId: result.asset.assetId,
      assetSha256: assetHash,
      visualRequirement: shot.visual,
      alternatives: result.alternatives,
      speechMode: shot.speech.mode,
      speaker: shot.speech.speaker,
      text: shot.speech.text,
      voice,
      durationHintSec: shot.durationHintSec,
      rhythm: shot.rhythm,
      emotion: shot.emotion,
      stance: shot.stance,
      expression: shot.expression,
      prompt: shot.prompt,
      transitionAfter: shot.transitionAfter
    });
  }
}

const reportSeq = await nextSequence(paths.prepareReports, 'prepare-');
const reportPath = resolve(
  paths.prepareReports,
  `prepare-${pad3(reportSeq)}.json`
);

const report = {
  contentId,
  approvalId: state.currentApproval.approvalId,
  createdAt: new Date().toISOString(),
  status: missing.length ? 'blocked' : 'ready',
  missingAssets: missing,
  resolvedShots: resolvedShots.map(x => ({
    shotId: x.shotId,
    assetId: x.assetId,
    alternatives: x.alternatives
  }))
};

await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');

state.lastPrepare = {
  status: report.status,
  reportPath,
  createdAt: report.createdAt
};

if (missing.length) {
  state.currentJob = null;
  await saveState(paths.state, state);

  console.log('Prepare 未通过：剧本有效，但缺少以下素材：');
  for (const item of missing) {
    console.log(
      `- ${item.shotId}: category=${item.requirement.category}` +
      `${item.requirement.plant ? ` plant=${item.requirement.plant}` : ''}` +
      `${item.requirement.symptom ? ` symptom=${item.requirement.symptom}` : ''}` +
      `${item.requirement.feature ? ` feature=${item.requirement.feature}` : ''}` +
      `${item.requirement.gender ? ` gender=${item.requirement.gender}` : ''}`
    );
  }
  console.log(`报告：${reportPath}`);
  process.exit(2);
}

const seq = await nextSequence(paths.prepared, 'job-');
const jobId = `job-${pad3(seq)}`;
const jobDir = resolve(paths.prepared, jobId);
await import('node:fs/promises').then(({ mkdir }) =>
  mkdir(jobDir, { recursive: true })
);

const resolvedByShotId = new Map(
  resolvedShots.map(shot => [shot.shotId, shot])
);

const preparedScenes = plan.scenes.map(scene => ({
  id: scene.id,
  role: scene.role,
  purpose: scene.purpose,
  shots: scene.shots.map(shot => {
    const resolved = resolvedByShotId.get(shot.id);
    if (!resolved) {
      throw new Error(`Prepare 内部错误：未找到已解析 Shot ${shot.id}`);
    }
    return resolved;
  })
}));

const job = {
  contractVersion: 2,
  planContractVersion: 4,
  jobId,
  contentId,
  approvalId: state.currentApproval.approvalId,
  planSha256: state.currentApproval.planHash,
  title: plan.title,
  goal: plan.goal,
  targetDurationSec: plan.targetDurationSec,
  subtitlePosition: plan.subtitlePosition,
  scenes: preparedScenes
};

const jobPath = resolve(jobDir, 'job.json');
await writeFile(jobPath, JSON.stringify(job, null, 2), 'utf8');
const jobHash = await hashFile(jobPath);

const manifest = {
  jobId,
  contentId,
  approvalId: job.approvalId,
  jobSha256: jobHash,
  preparedAt: new Date().toISOString(),
  assetHashes: Object.fromEntries(
    resolvedShots.map(x => [x.assetId, x.assetSha256])
  )
};

await writeFile(
  resolve(jobDir, 'manifest.json'),
  JSON.stringify(manifest, null, 2),
  'utf8'
);

state.currentJob = {
  jobId,
  jobPath,
  manifestPath: resolve(jobDir, 'manifest.json'),
  jobHash,
  approvalId: job.approvalId,
  preparedAt: manifest.preparedAt
};

await saveState(paths.state, state);

console.log(`Prepared Job 已生成：${jobId}`);
console.log(`Job：${jobPath}`);
console.log('只有 Prepared Job 才具备 Render 资格。');
