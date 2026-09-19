import { fileURLToPath } from 'node:url';
import {
  readFile,
  writeFile,
  mkdir,
  access
} from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs, requireContentId } from './args.mjs';
import { workflowPaths } from './paths.mjs';
import { workspacePath, resolveWorkspaceRelative } from './workspace.mjs';
import { loadState, saveState } from './state.mjs';
import { hashFile, hashObject } from './hash.mjs';
import { nextSequence, pad3 } from './sequence.mjs';
import {
  ensureDir,
  commandExists,
  ffmpegFull,
  duration,
  sanitizeWanVideo,
  prependAudioSilence,
  acquireLock
} from './utils.mjs';
import { generateAzureTts, normalizeTts, getAzureVoiceProfile } from './tts.mjs';
import { resolveAzurePerformance, resolveWanPerformance, buildPerformanceAudit } from './performance.mjs';
import {
  generateWanI2V,
  isWanFreeQuotaExhaustedError
} from './wan.mjs';
import {
  loadWanModelConfig,
  selectWanProfile,
  estimateWanProfileCost,
  recordWanUsage,
  markWanProfileExhausted,
  loadWanQuotaLedger
} from './wan-model-router.mjs';
import { runVideoRetalk } from './retalk.mjs';
import { createSubtitle } from './subtitle.mjs';
import { composeShot, concatShots } from './compose.mjs';

const args = parseArgs();
const contentId = requireContentId(args.get('--content'));
const paths = workflowPaths(contentId);
const state = await loadState(paths.state, contentId);

if (!state.currentJob) {
  throw new Error('当前没有 Prepared Job。Draft/Approved Plan 均不能直接 Render，请先 video:prepare');
}

const project = JSON.parse(await readFile(workspacePath('config', 'project.json'), 'utf8'));

const wanModelConfig =
  await loadWanModelConfig(
    resolveWorkspaceRelative(
      project.wan.modelRegistry ??
      'config/wan-models.json'
    )
  );

const maxCost = Number(args.get('--max-cost', project.budget.maxEstimatedVideoCostCny));

const jobHash = await hashFile(state.currentJob.jobPath);
if (jobHash !== state.currentJob.jobHash) {
  throw new Error('Prepared Job 已被修改，拒绝 Render；请重新 Prepare');
}

if (!state.currentApproval || state.currentApproval.approvalId !== state.currentJob.approvalId) {
  throw new Error('Prepared Job 不属于当前 Approved 计划，拒绝 Render');
}

const job = JSON.parse(await readFile(state.currentJob.jobPath, 'utf8'));

// 数据合同始终保留 Scene → Shot；只有执行时临时拍平。
const renderShots = (job.scenes ?? []).flatMap(scene =>
  (scene.shots ?? []).map(shot => ({
    ...shot,
    sceneId: scene.id,
    sceneRole: scene.role,
    scenePurpose: scene.purpose
  }))
);

if (!renderShots.length) {
  throw new Error('Prepared Job 没有可执行 Shot');
}

if (job.planSha256 !== state.currentApproval.planHash) {
  throw new Error('Job 的 Approved Plan 哈希不一致，拒绝 Render');
}

// Rebuild catalog and verify all asset snapshots before paid calls.
const build = (await import('node:child_process')).spawnSync(
  process.execPath,
  [fileURLToPath(new URL('./build-catalog.mjs', import.meta.url))],
  { stdio: 'inherit', env: process.env }
);
if (build.status !== 0) throw new Error('Asset Catalog 构建失败');

const catalog = JSON.parse(await readFile(workspacePath('assets', 'catalog.json'), 'utf8'));
const assetMap = new Map(catalog.assets.map(a => [a.assetId, a]));

for (const shot of renderShots) {
  const asset = assetMap.get(shot.assetId);
  if (!asset) throw new Error(`素材已不存在：${shot.assetId}`);
  const actual = await hashFile(resolveWorkspaceRelative(asset.path));
  if (actual !== shot.assetSha256) {
    throw new Error(`素材已发生变化：${shot.assetId}。请重新 Prepare 后再 Render`);
  }
}

// Preflight
if (!commandExists('ffmpeg') || !commandExists('ffprobe')) {
  throw new Error('缺少 ffmpeg / ffprobe');
}
ffmpegFull();

const needsSpeech = renderShots.some(s => s.speechMode !== 'none');
const needsWan = renderShots.some(s => s.type !== 'existing_video');
const needsRetalk = renderShots.some(
  s => s.type === 'person_dialogue'
);

if (needsSpeech && (!process.env.AZURE_SPEECH_KEY || !process.env.AZURE_SPEECH_REGION)) {
  throw new Error('缺少 Azure Speech 环境变量');
}
if (needsWan && (!process.env.DASHSCOPE_API_KEY || !process.env.DASHSCOPE_WORKSPACE_ID)) {
  throw new Error('缺少百炼环境变量');
}
if (needsRetalk && !commandExists('dashscope')) {
  throw new Error('VideoRetalk 需要 dashscope CLI');
}

const releaseLock = acquireLock(paths.lock);

let renderId;
let renderDir;
let manifestPath;

try {
  // Resume failed/in-progress render for the exact same immutable Job.
  if (
    state.currentRender &&
    state.currentRender.jobHash === jobHash &&
    ['running', 'failed'].includes(state.currentRender.status)
  ) {
    renderId = state.currentRender.renderId;
    renderDir = state.currentRender.renderDir;
    console.log(`继续 Render：${renderId}`);
  } else {
    const seq = await nextSequence(paths.renders, 'render-');
    renderId = `render-${pad3(seq)}`;
    renderDir = resolve(paths.renders, renderId);
    await mkdir(renderDir, { recursive: true });

    state.currentRender = {
      renderId,
      renderDir,
      jobHash,
      status: 'running',
      startedAt: new Date().toISOString()
    };
    await saveState(paths.state, state);
  }

  manifestPath = resolve(renderDir, 'manifest.json');
  const audioDir = resolve(renderDir, 'audio');
  const shotDir = resolve(renderDir, 'shots');
  const subtitleDir = resolve(renderDir, 'subtitles');
  const checkpointDir = resolve(renderDir, 'checkpoints');

  for (const dir of [audioDir, shotDir, subtitleDir, checkpointDir]) {
    ensureDir(dir);
  }

  const runtime = new Map();

  const previousShotById = new Map();

  for (const scene of job.scenes ?? []) {
    for (let i = 0; i < (scene.shots ?? []).length; i++) {
      const current = scene.shots[i];
      const previous = i > 0 ? scene.shots[i - 1] : null;

      previousShotById.set(
        current.shotId,
        previous
      );
    }
  }
  const performanceRows = [];

  async function checkpointPath(shotId) {
    return resolve(checkpointDir, `${shotId}.json`);
  }

  async function loadCheckpoint(shotId) {
    try {
      return JSON.parse(await readFile(await checkpointPath(shotId), 'utf8'));
    } catch {
      return { stages: {} };
    }
  }

  async function saveCheckpoint(shotId, cp) {
    await writeFile(await checkpointPath(shotId), JSON.stringify(cp, null, 2), 'utf8');
  }

  async function canReuse(stage, output) {
    if (!stage?.outputSha256) return false;
    try {
      const actual = await hashFile(output);
      return actual === stage.outputSha256;
    } catch {
      return false;
    }
  }

  // 1) TTS for all shots first (free tier), then estimate paid video cost.
  for (const shot of renderShots) {
    if (shot.speechMode === 'none') {
      runtime.set(shot.shotId, {
        audio: null,
        audioDuration: shot.durationHintSec,
        speechStart: 0,
        speechEnd: 0,
        azurePerformance: null
      });
      continue;
    }

    const cp = await loadCheckpoint(shot.shotId);
    const rawAudio = resolve(audioDir, `${shot.shotId}.mp3`);

    const voice = shot.voice || project.voices.default;
    const voiceProfile = await getAzureVoiceProfile(voice);
    const azurePerformance = resolveAzurePerformance({
      rhythm: shot.rhythm,
      emotion: shot.emotion,
      stance: shot.stance ?? '默认',
      expression: shot.expression ?? '默认',
      supportedStyles: voiceProfile.StyleList ?? [],
      voice,
      project
    });
    const normalized = resolve(audioDir, `${shot.shotId}.wav`);
    const ttsInputHash = hashObject({
      text: shot.text,
      voice,
      rhythm: shot.rhythm,
      emotion: shot.emotion,
      stance: shot.stance ?? '默认',
      expression: shot.expression ?? '默认',
      azureStyleSource: azurePerformance.styleSource,
      azureStyle: azurePerformance.style,
      azureStyleDegree: azurePerformance.styleDegree,
      azureTemperature: azurePerformance.temperature,
      azureRatePct: azurePerformance.ratePct,
      azurePitchPct: azurePerformance.pitchPct,
      keepLeading: azurePerformance.keepLeadingSilence,
      keepTrailing: azurePerformance.keepTrailingSilence,
      minimumDuration:
        shot.type === 'person_dialogue'
          ? project.audio.retalkMinAudioDuration
          : 0
    });

    if (
      cp.stages.tts?.inputHash === ttsInputHash &&
      await canReuse(cp.stages.tts, normalized)
    ) {
      const meta = cp.stages.tts.meta;
      runtime.set(shot.shotId, {
        audio: normalized,
        audioDuration: meta.duration,
        speechStart: meta.speechStart,
        speechEnd: meta.speechEnd,
        azurePerformance
      });
      continue;
    }

    await generateAzureTts({
      text: shot.text,
      voice,
      output: rawAudio,
      performance: azurePerformance
    });

    const meta = normalizeTts({
      input: rawAudio,
      output: normalized,
      azureStyle: azurePerformance.style,
      azureStyleDegree: azurePerformance.styleDegree,
      azureRatePct: azurePerformance.ratePct,
      azurePitchPct: azurePerformance.pitchPct,
      keepLeading: azurePerformance.keepLeadingSilence,
      keepTrailing: azurePerformance.keepTrailingSilence,
      minimumDuration:
        shot.type === 'person_dialogue'
          ? project.audio.retalkMinAudioDuration
          : 0
    });

    cp.stages.tts = {
      inputHash: ttsInputHash,
      outputSha256: await hashFile(normalized),
      meta: {
        ...meta,
        performance: {
          emotion: shot.emotion,
          stance: shot.stance ?? '默认',
          expression: shot.expression ?? '默认',
          styleSource: azurePerformance.styleSource,
          style: azurePerformance.style,
          styleDegree: azurePerformance.styleDegree,
          temperature: azurePerformance.temperature,
          supportLevel: azurePerformance.supportLevel,
          variance: azurePerformance.variance,
          ratePct: azurePerformance.ratePct,
          pitchPct: azurePerformance.pitchPct
        }
      }
    };
    await saveCheckpoint(shot.shotId, cp);

    runtime.set(shot.shotId, {
      audio: normalized,
      audioDuration: meta.duration,
      speechStart: meta.speechStart,
      speechEnd: meta.speechEnd,
      azurePerformance
    });
  }

  // Cost gate + Wan lane pin.
  // Dialogue lane preserves one model across all talking-person shots.
  // Silent visual lane is separate because Wan 2.7/2.6 audio models do not
  // provide a reliable audio=false path, while plant/B-roll should stay silent.
  const costRows = [];
  const dialogueRows = [];
  const silentVisualRows = [];
  let dialogueWanSeconds = 0;
  let silentVisualWanSeconds = 0;

  for (const shot of renderShots) {
    const rt = runtime.get(shot.shotId);
    let wanDuration = null;
    let resolution = null;
    let wanLane = null;

    if (shot.type === 'plant') {
      wanDuration = Math.max(
        2,
        Math.ceil(
          rt.audioDuration ||
          shot.durationHintSec
        )
      );
      resolution = project.wan.plantResolution;
      wanLane = 'silentVisual';
    } else if (
      shot.type === 'person_voiceover'
    ) {
      const warmup = Number(
        project.performance.wanVisual
          ?.warmupSecByShotType
          ?.person_voiceover ?? 0
      );

      wanDuration = Math.max(
        2,
        Math.ceil(
          (rt.audioDuration || shot.durationHintSec) +
          warmup
        )
      );
      resolution =
        project.wan.personVoiceoverResolution;
      wanLane = 'silentVisual';
    } else if (
      shot.type === 'person_dialogue'
    ) {
      const warmup = Number(
        project.performance.wanVisual
          ?.warmupSecByShotType
          ?.person_dialogue ?? 0
      );

      wanDuration = Math.max(
        3,
        Math.ceil(
          rt.audioDuration + warmup
        )
      );
      resolution =
        project.wan.personDialogueResolution;
      wanLane = 'dialogue';
    }

    rt.wanDuration = wanDuration;
    rt.resolution = resolution;
    rt.wanLane = wanLane;

    const row = {
      shotId: shot.shotId,
      wanLane,
      wanDuration,
      resolution,
      estimatedWanCostCny: 0,
      estimatedRetalkCostCny: 0,
      estimatedCostCny: 0
    };

    costRows.push(row);

    if (wanLane === 'dialogue') {
      dialogueRows.push(row);
      dialogueWanSeconds += wanDuration;
    } else if (wanLane === 'silentVisual') {
      silentVisualRows.push(row);
      silentVisualWanSeconds += wanDuration;
    }
  }

  const dialogueSelection =
    dialogueRows.length
      ? await selectWanProfile({
          config: wanModelConfig,
          lane: 'dialogue',
          totalSeconds: dialogueWanSeconds,
          requirements: {
            purpose: 'dialogue',
            silentOutput: false,
            resolutions: [
              ...new Set(
                dialogueRows.map(
                  row => row.resolution
                )
              )
            ],
            durations: dialogueRows.map(
              row => row.wanDuration
            )
          },
          override:
            args.get('--wan-dialogue-model') ??
            args.get('--wan-model')
        })
      : null;

  const silentVisualSelection =
    silentVisualRows.length
      ? await selectWanProfile({
          config: wanModelConfig,
          lane: 'silentVisual',
          totalSeconds: silentVisualWanSeconds,
          requirements: {
            purpose: 'silentVisual',
            silentOutput: true,
            resolutions: [
              ...new Set(
                silentVisualRows.map(
                  row => row.resolution
                )
              )
            ],
            durations: silentVisualRows.map(
              row => row.wanDuration
            )
          },
          override:
            args.get('--wan-silent-model')
        })
      : null;

  const estimatedDialogueWanCost =
    estimateWanProfileCost({
      selection: dialogueSelection,
      rows: dialogueRows,
      purpose: 'dialogue'
    });

  const estimatedSilentWanCost =
    estimateWanProfileCost({
      selection: silentVisualSelection,
      rows: silentVisualRows,
      purpose: 'silentVisual'
    });

  let estimatedRetalkCost = 0;

  for (const row of dialogueRows) {
    const shot = renderShots.find(
      item => item.shotId === row.shotId
    );
    const rt = runtime.get(row.shotId);

    if (shot?.type === 'person_dialogue') {
      const warmup = Number(
        project.performance.wanVisual
          ?.warmupSecByShotType
          ?.person_dialogue ?? 0
      );
      const estimatedRetalkSec = Math.max(
        rt.audioDuration,
        row.wanDuration - warmup
      );

      row.estimatedRetalkCostCny = Number(
        (
          estimatedRetalkSec *
          project.retalk.costPerSecondCny
        ).toFixed(3)
      );
      estimatedRetalkCost +=
        row.estimatedRetalkCostCny;
    }
  }

  const selectionForRow = row =>
    row.wanLane === 'dialogue'
      ? dialogueSelection
      : row.wanLane === 'silentVisual'
        ? silentVisualSelection
        : null;

  for (const row of costRows) {
    const selection = selectionForRow(row);
    if (!selection) continue;

    row.wanProfileId = selection.profileId;
    row.wanModel = selection.profile.model;
    row.wanBillingMode =
      selection.profile.billingMode;
    row.dialogueVisualMode =
      row.wanLane === 'dialogue'
        ? selection.profile.dialogueVisualMode
        : null;

    if (
      selection.profile.billingMode === 'paid' &&
      row.wanDuration
    ) {
      const priceMode =
        row.wanLane === 'dialogue' &&
        selection.profile.dialogueVisualMode ===
          'driving-audio'
          ? 'drivingAudio'
          : 'silent';

      const price =
        selection.profile
          .listPriceCnyPerSec
          ?.[priceMode]
          ?.[row.resolution];

      row.estimatedWanCostCny = Number(
        (
          row.wanDuration *
          Number(price)
        ).toFixed(3)
      );
    }

    row.estimatedCostCny = Number(
      (
        row.estimatedWanCostCny +
        row.estimatedRetalkCostCny
      ).toFixed(3)
    );
  }

  const estimate =
    estimatedDialogueWanCost +
    estimatedSilentWanCost +
    estimatedRetalkCost;

  if (dialogueSelection) {
    console.log(
      `Wan dialogue lane：${dialogueSelection.profileId} → ${dialogueSelection.profile.model} / ${dialogueSelection.profile.dialogueVisualMode} + VideoRetalk`
    );

    if (
      dialogueSelection.profile.billingMode ===
      'free-first'
    ) {
      console.log(
        `dialogue 免费额度 ${dialogueSelection.localRemainingSec}s；本次预计 ${dialogueWanSeconds}s`
      );
    } else {
      console.log(
        'dialogue 已进入长期付费 fallback：Wan 2.6 Flash silent + VideoRetalk'
      );
    }
  }

  if (silentVisualSelection) {
    console.log(
      `Wan silentVisual lane：${silentVisualSelection.profileId} → ${silentVisualSelection.profile.model}`
    );
  }

  console.log(
    `预计视频生成成本：¥${estimate.toFixed(2)} / 上限 ¥${maxCost.toFixed(2)}`
  );

  if (estimate > maxCost) {
    throw new Error(
      `预计视频生成成本 ¥${estimate.toFixed(2)} 超过上限 ¥${maxCost.toFixed(2)}；未调用 Wan/VideoRetalk`
    );
  }

  state.currentRender ??= {};
  state.currentRender.wanProfiles = {
    dialogue: dialogueSelection
      ? {
          profileId: dialogueSelection.profileId,
          model: dialogueSelection.profile.model,
          adapter: dialogueSelection.profile.adapter,
          adapterVersion:
            dialogueSelection.profile.adapterVersion,
          billingMode:
            dialogueSelection.profile.billingMode,
          dialogueVisualMode:
            dialogueSelection.profile.dialogueVisualMode
        }
      : null,
    silentVisual: silentVisualSelection
      ? {
          profileId:
            silentVisualSelection.profileId,
          model:
            silentVisualSelection.profile.model,
          adapter:
            silentVisualSelection.profile.adapter,
          adapterVersion:
            silentVisualSelection.profile.adapterVersion,
          billingMode:
            silentVisualSelection.profile.billingMode
        }
      : null,
    pinnedAt: new Date().toISOString()
  };

  await saveState(paths.state, state);

  // 2) Render each shot with checkpoints.
  const finalShots = [];
  const dialogueAudioContracts = [];

  for (const shot of renderShots) {
    console.log(`处理 ${shot.shotId} (${shot.type})`);
    const cp = await loadCheckpoint(shot.shotId);
    const rt = runtime.get(shot.shotId);
    const asset = assetMap.get(shot.assetId);
    const assetPath = resolveWorkspaceRelative(asset.path);
    let sourceVideo = assetPath;

    if (shot.type === 'existing_video') {
      performanceRows.push(
        buildPerformanceAudit({
          shot,
          voice: shot.speechMode === 'none'
            ? null
            : (shot.voice || project.voices.default),
          azure: rt.azurePerformance ?? null,
          wan: null
        })
      );
    }

    if (shot.type !== 'existing_video') {
      const wanOutput = resolve(
        shotDir,
        `${shot.shotId}-wan.mp4`
      );

      const previousShot =
        previousShotById.get(shot.shotId) ?? null;

      const wanSelection =
        rt.wanLane === 'dialogue'
          ? dialogueSelection
          : silentVisualSelection;

      if (!wanSelection) {
        throw new Error(
          `${shot.shotId} 缺少 ${rt.wanLane} Wan selection`
        );
      }

      const audioDrivenDialogue =
        shot.type === 'person_dialogue' &&
        wanSelection.profile.dialogueVisualMode ===
          'driving-audio';

      const wanPerformance = resolveWanPerformance({
        shotType: shot.type,
        rhythm: shot.rhythm,
        emotion: shot.emotion,
        stance: shot.stance ?? '默认',
        expression: shot.expression ?? '默认',
        seedKey:
          `${job.contentId}:${shot.sceneId}:${shot.shotId}`,
        continuityContext: {
          sameScene: Boolean(previousShot),
          sameAsset:
            Boolean(
              previousShot &&
              previousShot.assetId === shot.assetId
            ),
          previousEmotion:
            previousShot?.emotion ?? null
        },
        audioDrivenDialogue,
        project
      });

      const effectivePrompt = [
        shot.prompt,
        wanPerformance.promptSuffix
      ]
        .filter(Boolean)
        .join(' ');

      performanceRows.push(
        buildPerformanceAudit({
          shot,
          voice:
            shot.speechMode === 'none'
              ? null
              : (shot.voice || project.voices.default),
          azure: rt.azurePerformance ?? null,
          wan: wanPerformance
        })
      );

      let drivingAudioPath = null;
      let drivingAudioSha256 = '';
      let normalizedAudioSha256 = '';

      if (shot.type === 'person_dialogue') {
        normalizedAudioSha256 =
          await hashFile(rt.audio);

        const warmupSec = Number(
          project.performance.wanVisual
            ?.warmupSecByShotType
            ?.person_dialogue ?? 0
        );

        if (audioDrivenDialogue) {
          const driverAudio = resolve(
            audioDir,
            `${shot.shotId}-wan-driver.wav`
          );

          const driverInputHash = hashObject({
            normalizedAudioSha256,
            warmupSec,
            contractVersion: 1
          });

          if (
            cp.stages.wanDriverAudio?.inputHash ===
              driverInputHash &&
            await canReuse(
              cp.stages.wanDriverAudio,
              driverAudio
            )
          ) {
            drivingAudioPath = driverAudio;
          } else {
            const driverMeta = prependAudioSilence({
              input: rt.audio,
              output: driverAudio,
              seconds: warmupSec
            });

            cp.stages.wanDriverAudio = {
              inputHash: driverInputHash,
              outputSha256:
                await hashFile(driverAudio),
              normalizedAudioSha256,
              leadingSilenceSec:
                driverMeta.leadingSilenceSec,
              duration: driverMeta.duration
            };

            await saveCheckpoint(
              shot.shotId,
              cp
            );
            drivingAudioPath = driverAudio;
          }

          drivingAudioSha256 =
            await hashFile(drivingAudioPath);
        }

        dialogueAudioContracts.push({
          shotId: shot.shotId,
          normalizedAudioSha256,
          wanVisualGuidance:
            audioDrivenDialogue
              ? {
                  enabled: true,
                  inputSha256:
                    normalizedAudioSha256,
                  driverSha256:
                    drivingAudioSha256
                }
              : {
                  enabled: false,
                  inputSha256: null,
                  driverSha256: null
                },
          videoRetalk: {
            enabled: true,
            inputSha256:
              normalizedAudioSha256
          },
          sameNormalizedAudioForWanAndRetalk:
            audioDrivenDialogue
              ? true
              : null
        });
      }

      const wanInputHash = hashObject({
        assetSha256: shot.assetSha256,
        prompt: effectivePrompt,
        negativePrompt:
          wanPerformance.negativePrompt,
        seed: wanPerformance.seed,
        rhythm: shot.rhythm,
        emotion: shot.emotion,
        stance: shot.stance ?? '默认',
        expression: shot.expression ?? '默认',
        duration: rt.wanDuration,
        resolution: rt.resolution,
        profileId: wanSelection.profileId,
        model: wanSelection.profile.model,
        adapter: wanSelection.profile.adapter,
        adapterVersion:
          wanSelection.profile.adapterVersion,
        dialogueVisualMode:
          shot.type === 'person_dialogue'
            ? wanSelection.profile.dialogueVisualMode
            : null,
        drivingAudioSha256
      });

      if (
        cp.stages.wan?.inputHash === wanInputHash &&
        await canReuse(cp.stages.wan, wanOutput)
      ) {
        sourceVideo = wanOutput;
      } else {
        let result;

        try {
          result = await generateWanI2V({
            profile: wanSelection.profile,
            imagePath: assetPath,
            prompt: effectivePrompt,
            negativePrompt:
              wanPerformance.negativePrompt,
            seed: wanPerformance.seed,
            duration: rt.wanDuration,
            resolution: rt.resolution,
            output: wanOutput,
            drivingAudioPath,
            quotaExhaustedCodes:
              wanModelConfig.routing
                .freeQuotaExhaustedCodes
          });
        } catch (error) {
          if (
            isWanFreeQuotaExhaustedError(error)
          ) {
            await markWanProfileExhausted({
              config: wanModelConfig,
              profileId: wanSelection.profileId,
              reason:
                error.providerCode ?? error.code
            });
          }

          throw error;
        }

        await recordWanUsage({
          config: wanModelConfig,
          profileId: wanSelection.profileId,
          seconds:
            result.usageSec ?? rt.wanDuration
        });

        cp.stages.wan = {
          inputHash: wanInputHash,
          outputSha256:
            await hashFile(wanOutput),
          lane: rt.wanLane,
          profileId: wanSelection.profileId,
          model: result.model,
          adapter: result.adapter,
          adapterVersion: result.adapterVersion,
          dialogueVisualMode:
            shot.type === 'person_dialogue'
              ? wanSelection.profile.dialogueVisualMode
              : null,
          drivingAudio:
            Boolean(drivingAudioPath),
          drivingAudioSha256:
            drivingAudioSha256 || null,
          taskId: result.taskId,
          requestId:
            result.requestId ?? null,
          seed: wanPerformance.seed,
          usageSec: result.usageSec,
          usage: result.usage ?? null
        };

        await saveCheckpoint(shot.shotId, cp);
        sourceVideo = wanOutput;
      }

      const warmupSec = Number(
        project.performance.wanVisual
          ?.warmupSecByShotType
          ?.[shot.type] ?? 0
      );

      const sanitizedWanOutput = resolve(
        shotDir,
        `${shot.shotId}-wan-sanitized.mp4`
      );

      const sanitizeInputHash = hashObject({
        sourceSha256: await hashFile(sourceVideo),
        warmupSec,
        stripAudio: true
      });

      if (
        cp.stages.wanSanitize?.inputHash ===
          sanitizeInputHash &&
        await canReuse(
          cp.stages.wanSanitize,
          sanitizedWanOutput
        )
      ) {
        sourceVideo = sanitizedWanOutput;
      } else {
        const sanitizeMeta = sanitizeWanVideo({
          input: sourceVideo,
          output: sanitizedWanOutput,
          trimStartSec: warmupSec
        });

        cp.stages.wanSanitize = {
          inputHash: sanitizeInputHash,
          outputSha256:
            await hashFile(sanitizedWanOutput),
          trimStartSec: warmupSec,
          outputDuration:
            sanitizeMeta.duration,
          strippedAudio: true
        };

        await saveCheckpoint(shot.shotId, cp);
        sourceVideo = sanitizedWanOutput;
      }

      // Production invariant: every talking-person shot ends with VideoRetalk,
      // even when Wan used the same Azure audio as visual performance guidance.
      if (shot.type === 'person_dialogue') {
        const retalkOutput = resolve(
          shotDir,
          `${shot.shotId}-retalk.mp4`
        );
        const normalizedAudioSha256 =
          await hashFile(rt.audio);
        const retalkInputHash = hashObject({
          videoSha256:
            await hashFile(sourceVideo),
          normalizedAudioSha256,
          model: 'videoretalk',
          videoExtension: false,
          contractVersion: 2
        });

        if (
          cp.stages.retalk?.inputHash ===
            retalkInputHash &&
          await canReuse(
            cp.stages.retalk,
            retalkOutput
          )
        ) {
          sourceVideo = retalkOutput;
        } else {
          const result = await runVideoRetalk({
            videoPath: sourceVideo,
            audioPath: rt.audio,
            output: retalkOutput
          });

          cp.stages.retalk = {
            inputHash: retalkInputHash,
            outputSha256:
              await hashFile(retalkOutput),
            normalizedAudioSha256,
            taskId: result.taskId
          };
          await saveCheckpoint(shot.shotId, cp);
          sourceVideo = retalkOutput;
        }
      }
    } else {
      const requiredDuration = rt.audio
        ? rt.audioDuration
        : shot.durationHintSec;

      if (duration(sourceVideo) + 0.001 < requiredDuration) {
        throw new Error(
          `${shot.shotId} 小程序录屏只有 ${duration(sourceVideo).toFixed(2)}s，短于需要的 ${requiredDuration.toFixed(2)}s`
        );
      }
    }

    const subtitlePath = resolve(subtitleDir, `${shot.shotId}.ass`);
    let subtitle = null;

    if (shot.text) {
      subtitle = await createSubtitle({
        text: shot.text,
        speechStart: rt.speechStart,
        speechEnd: rt.speechEnd,
        positionName: job.subtitlePosition,
        output: subtitlePath,
        project
      });
    }

    const finalOutput = resolve(shotDir, `${shot.shotId}-final.mp4`);
    const finalDuration = rt.audio ? rt.audioDuration : shot.durationHintSec;
    const composeInputHash = hashObject({
      sourceVideoSha256: await hashFile(sourceVideo),
      audioSha256: rt.audio ? await hashFile(rt.audio) : '',
      subtitle: shot.text,
      subtitlePosition: job.subtitlePosition,
      duration: finalDuration,
      width: project.video.width,
      height: project.video.height
    });

    if (
      cp.stages.compose?.inputHash === composeInputHash &&
      await canReuse(cp.stages.compose, finalOutput)
    ) {
      finalShots.push({
        path: finalOutput,
        transitionAfter: shot.transitionAfter
      });
    } else {
      composeShot({
        video: sourceVideo,
        audio: rt.audio,
        subtitle,
        duration: finalDuration,
        output: finalOutput,
        project
      });

      cp.stages.compose = {
        inputHash: composeInputHash,
        outputSha256: await hashFile(finalOutput)
      };
      await saveCheckpoint(shot.shotId, cp);
      finalShots.push({
        path: finalOutput,
        transitionAfter: shot.transitionAfter
      });
    }
  }

  const finalOutput = resolve(renderDir, 'final.mp4');
  await concatShots({
    shots: finalShots,
    output: finalOutput,
    workDir: renderDir,
    project
  });

  const renderManifest = {
    renderId,
    contentId,
    jobId: job.jobId,
    jobSha256: jobHash,
    approvalId: job.approvalId,
    estimatedVideoCostCny: Number(estimate.toFixed(3)),
    wanRouting: {
      pinScope: 'lane',
      dialogue: dialogueSelection
        ? {
            profileId:
              dialogueSelection.profileId,
            model:
              dialogueSelection.profile.model,
            adapter:
              dialogueSelection.profile.adapter,
            adapterVersion:
              dialogueSelection.profile.adapterVersion,
            billingMode:
              dialogueSelection.profile.billingMode,
            dialogueVisualMode:
              dialogueSelection.profile.dialogueVisualMode,
            totalWanSeconds:
              dialogueWanSeconds,
            localRemainingSecBefore:
              dialogueSelection.localRemainingSec
          }
        : null,
      silentVisual: silentVisualSelection
        ? {
            profileId:
              silentVisualSelection.profileId,
            model:
              silentVisualSelection.profile.model,
            adapter:
              silentVisualSelection.profile.adapter,
            adapterVersion:
              silentVisualSelection.profile.adapterVersion,
            billingMode:
              silentVisualSelection.profile.billingMode,
            totalWanSeconds:
              silentVisualWanSeconds
          }
        : null,
      quotaLedgerAfter:
        await loadWanQuotaLedger(
          wanModelConfig
        )
    },
    dialogueAudioContracts,
    performanceConfigVersion: project.performance?.version ?? null,
    voiceSet: project.voices,
    costRows,
    performanceRows,
    finalOutput,
    finalSha256: await hashFile(finalOutput),
    completedAt: new Date().toISOString()
  };

  await writeFile(
    manifestPath,
    JSON.stringify(renderManifest, null, 2),
    'utf8'
  );

  state.currentRender = {
    renderId,
    renderDir,
    jobHash,
    status: 'completed',
    completedAt: renderManifest.completedAt,
    finalOutput
  };

  state.renderHistory.push({
    renderId,
    jobId: job.jobId,
    approvalId: job.approvalId,
    finalOutput,
    completedAt: renderManifest.completedAt
  });

  await saveState(paths.state, state);

  console.log(`Render 完成：${finalOutput}`);
} catch (error) {
  if (state.currentRender) {
    state.currentRender.status = 'failed';
    state.currentRender.failedAt = new Date().toISOString();
    state.currentRender.error = error.message;
    await saveState(paths.state, state);
  }
  if (
    isWanFreeQuotaExhaustedError(
      error
    )
  ) {
    console.error(
      'Wan dialogue 免费额度已耗尽，当前 profile 已标记 exhausted；wrapper 将复用 TTS/素材 checkpoint，并切换下一个 dialogue 模型。'
    );
    process.exitCode = 75;
  } else {
    throw error;
  }
} finally {
  releaseLock();
}
