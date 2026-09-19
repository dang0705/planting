import { readdir, readFile } from 'node:fs/promises';
import { parseArgs, requireContentId } from './args.mjs';
import { workflowPaths } from './paths.mjs';
import { loadState } from './state.mjs';

const args = parseArgs();
const contentId = requireContentId(args.get('--content'));
const paths = workflowPaths(contentId);
const state = await loadState(paths.state, contentId);

const drafts = (await readdir(paths.drafts).catch(() => []))
  .filter(x => /^draft-\d+\.json$/.test(x))
  .sort();

console.log(`Content: ${contentId}`);
console.log(`Drafts: ${drafts.length}${drafts.length ? ` (${drafts.at(-1)} latest)` : ''}`);

if (drafts.length) {
  const latestDraft = drafts.at(-1);
  const latestMeta = latestDraft.replace(/\.json$/, '.meta.json');

  try {
    const meta = JSON.parse(
      await readFile(`${paths.drafts}/${latestMeta}`, 'utf8')
    );

    console.log(
      `Producer: ${meta.producer?.name ?? '未记录'}` +
      `${meta.producer?.model ? ` / ${meta.producer.model}` : ''}`
    );
    console.log(
      `Skill: ${meta.skillUsage?.skillName ?? '未记录'} / ` +
      `${meta.skillUsage?.skillVersion ?? 'unknown'} / ` +
      `${meta.skillUsage?.verification ?? '未声明'}`
    );
    console.log(
      `Platforms: ${(meta.targetPlatforms ?? []).join(', ') || '未记录'}`
    );
    console.log(
      `Draft status: ${meta.status ?? '未记录'}`
    );
  } catch {
    console.log('Producer / Skill: 未记录');
  }
}
console.log(
  `Approved: ${state.currentApproval?.approvalId ?? '无'}`
);
console.log(
  `Prepared Job: ${state.currentJob?.jobId ?? '无'}`
);
console.log(
  `Last Prepare: ${state.lastPrepare?.status ?? '无'}`
);
console.log(
  `Current Render: ${state.currentRender
    ? `${state.currentRender.renderId} / ${state.currentRender.status}`
    : '无'}`
);

if (state.currentRender?.finalOutput) {
  console.log(`Final: ${state.currentRender.finalOutput}`);
}

if (state.lastPrepare?.status === 'blocked') {
  try {
    const report = JSON.parse(await readFile(state.lastPrepare.reportPath, 'utf8'));
    console.log(`Missing assets: ${report.missingAssets.length}`);
    for (const item of report.missingAssets) {
      console.log(`- ${item.shotId}: ${JSON.stringify(item.requirement)}`);
    }
  } catch {}
}
