import {
  readFile,
  writeFile,
  mkdir
} from 'node:fs/promises';
import {
  resolve,
  dirname
} from 'node:path';
import { workspacePath, resolveWorkspaceRelative } from './workspace.mjs';

function iso() {
  return new Date().toISOString();
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(
      await readFile(path, 'utf8')
    );
  } catch {
    return fallback;
  }
}

async function writeJson(path, value) {
  await mkdir(
    dirname(path),
    { recursive: true }
  );

  await writeFile(
    path,
    JSON.stringify(value, null, 2) + '\n',
    'utf8'
  );
}

export async function loadWanModelConfig(
  path = workspacePath('config', 'wan-models.json')
) {
  const config = JSON.parse(
    await readFile(path, 'utf8')
  );

  if (
    !config?.routing?.lanes ||
    !config?.profiles
  ) {
    throw new Error(
      'wan-models.json 缺少 routing.lanes / profiles'
    );
  }

  return config;
}

function initialLedger(config) {
  const profiles = {};

  for (
    const [id, profile]
    of Object.entries(config.profiles)
  ) {
    if (
      profile.billingMode !== 'free-first'
    ) {
      continue;
    }

    profiles[id] = {
      remainingSec: Number(
        profile.freeQuota?.initialSec ?? 0
      ),
      exhausted: false,
      expiresAt:
        profile.freeQuota?.expiresAt ?? null,
      source:
        profile.freeQuota?.source ?? null,
      updatedAt: iso()
    };
  }

  return {
    version: 2,
    profiles,
    updatedAt: iso()
  };
}

export async function loadWanQuotaLedger(config) {
  const path = resolve(
    config.routing.quotaLedgerFile
  );

  const initial = initialLedger(config);
  const current = await readJson(path, null);

  if (!current) {
    await writeJson(path, initial);
    return initial;
  }

  current.profiles ??= {};

  for (
    const [id, row]
    of Object.entries(initial.profiles)
  ) {
    if (!current.profiles[id]) {
      current.profiles[id] = row;
    }
  }

  // Do not reset or increase existing local usage when config changes.
  current.version = 2;
  return current;
}

export async function saveWanQuotaLedger(
  config,
  ledger
) {
  ledger.updatedAt = iso();
  await writeJson(
    resolveWorkspaceRelative(config.routing.quotaLedgerFile),
    ledger
  );
}

export async function loadWanRoutingState(config) {
  const current = await readJson(
    resolveWorkspaceRelative(config.routing.routingStateFile),
    null
  );

  if (current) {
    // v1 migration: old forcedProfileId becomes dialogue-only preference.
    if (
      current.forcedProfileId &&
      !current.forcedDialogueProfileId
    ) {
      current.forcedDialogueProfileId =
        current.forcedProfileId;
    }

    current.version = 2;
    return current;
  }

  return {
    version: 2,
    mode:
      config.routing.defaultMode ?? 'auto',
    forcedDialogueProfileId: null,
    updatedAt: iso()
  };
}

export async function saveWanRoutingState(
  config,
  state
) {
  state.version = 2;
  delete state.forcedProfileId;
  state.updatedAt = iso();

  await writeJson(
    resolveWorkspaceRelative(config.routing.routingStateFile),
    state
  );
}

function expired(date) {
  if (!date) return false;

  const value = new Date(
    `${date}T23:59:59+08:00`
  );

  return (
    Number.isFinite(value.getTime()) &&
    Date.now() > value.getTime()
  );
}

function capabilityCheck(
  profile,
  requirements
) {
  if (!profile.enabled) {
    return 'disabled';
  }

  const cap = profile.capabilities ?? {};

  if (requirements.purpose === 'dialogue') {
    const mode = profile.dialogueVisualMode;

    if (mode === 'driving-audio') {
      if (!cap.drivingAudio) {
        return 'dialogue drivingAudio unsupported';
      }
    } else if (mode === 'silent') {
      if (!cap.silentOutput) {
        return 'dialogue silentOutput unsupported';
      }
    } else {
      return 'dialogueVisualMode missing';
    }
  }

  if (
    requirements.silentOutput &&
    !cap.silentOutput
  ) {
    return 'silentOutput unsupported';
  }

  for (const r of requirements.resolutions) {
    if (!cap.resolutions?.includes(r)) {
      return `resolution ${r} unsupported`;
    }
  }

  const min = Number(cap.duration?.min ?? 0);
  const max = Number(
    cap.duration?.max ??
    Number.MAX_SAFE_INTEGER
  );

  for (const d of requirements.durations) {
    if (d < min || d > max) {
      return `duration ${d}s outside ${min}~${max}s`;
    }
  }

  return null;
}

function requestedDialogueProfile({
  override,
  state,
  laneConfig
}) {
  if (!laneConfig.allowForced) {
    return null;
  }

  if (override && override !== 'auto') {
    return override;
  }

  if (
    state.mode === 'forced' &&
    state.forcedDialogueProfileId
  ) {
    return state.forcedDialogueProfileId;
  }

  return null;
}

export async function selectWanProfile({
  config,
  lane,
  totalSeconds,
  requirements,
  override = null
}) {
  const laneConfig =
    config.routing.lanes?.[lane];

  if (!laneConfig) {
    throw new Error(`未知 Wan lane：${lane}`);
  }

  const ledger =
    await loadWanQuotaLedger(config);
  const state =
    await loadWanRoutingState(config);

  const requested =
    lane === 'dialogue'
      ? requestedDialogueProfile({
          override:
            override ??
            process.env.WAN_MODEL ??
            null,
          state,
          laneConfig
        })
      : null;

  const order = requested
    ? [requested]
    : laneConfig.autoOrder;

  const decisions = [];

  for (const id of order) {
    const profile = config.profiles[id];

    if (!profile) {
      decisions.push({
        profileId: id,
        accepted: false,
        reason: 'unknown profile'
      });
      continue;
    }

    const reason = capabilityCheck(
      profile,
      requirements
    );

    if (reason) {
      decisions.push({
        profileId: id,
        accepted: false,
        reason
      });
      continue;
    }

    if (
      profile.billingMode === 'free-first'
    ) {
      const q = ledger.profiles?.[id];

      if (!q) {
        decisions.push({
          profileId: id,
          accepted: false,
          reason: 'quota ledger missing'
        });
        continue;
      }

      if (q.exhausted || expired(q.expiresAt)) {
        decisions.push({
          profileId: id,
          accepted: false,
          reason: q.exhausted
            ? 'quota exhausted'
            : 'quota expired',
          remainingSec: q.remainingSec
        });
        continue;
      }

      if (
        Number(q.remainingSec) <
        Number(totalSeconds)
      ) {
        decisions.push({
          profileId: id,
          accepted: false,
          reason:
            `local quota ${q.remainingSec}s < lane ${totalSeconds}s`,
          remainingSec: q.remainingSec
        });
        continue;
      }

      return {
        lane,
        profileId: id,
        profile,
        billingMode: profile.billingMode,
        localRemainingSec: q.remainingSec,
        mode: requested ? 'forced' : 'auto',
        decisions
      };
    }

    return {
      lane,
      profileId: id,
      profile,
      billingMode: profile.billingMode,
      localRemainingSec: null,
      mode: requested ? 'forced' : 'auto',
      decisions
    };
  }

  throw new Error(
    [
      `没有满足 ${lane} lane 的 Wan profile：`,
      ...decisions.map(
        row => `${row.profileId}: ${row.reason}`
      )
    ].join('\n')
  );
}

export function resolveWanPriceMode({
  selection,
  purpose
}) {
  if (purpose === 'dialogue') {
    return selection.profile.dialogueVisualMode ===
      'driving-audio'
      ? 'drivingAudio'
      : 'silent';
  }

  return 'silent';
}

export function estimateWanProfileCost({
  selection,
  rows,
  purpose
}) {
  if (!selection) return 0;

  if (
    selection.profile.billingMode ===
    'free-first'
  ) {
    return 0;
  }

  const mode = resolveWanPriceMode({
    selection,
    purpose
  });

  let total = 0;

  for (const row of rows) {
    if (!row.wanDuration) continue;

    const price =
      selection.profile
        .listPriceCnyPerSec
        ?.[mode]
        ?.[row.resolution];

    if (price == null) {
      throw new Error(
        `付费模型 ${selection.profile.model} 未配置 ${mode}/${row.resolution} 价格，拒绝越过 cost gate`
      );
    }

    total +=
      Number(row.wanDuration) *
      Number(price);
  }

  return total;
}

export async function recordWanUsage({
  config,
  profileId,
  seconds
}) {
  const profile = config.profiles[profileId];

  if (
    profile?.billingMode !== 'free-first'
  ) {
    return;
  }

  const ledger =
    await loadWanQuotaLedger(config);
  const q = ledger.profiles?.[profileId];

  if (!q) return;

  q.remainingSec = Math.max(
    0,
    Number(q.remainingSec) -
    Number(seconds)
  );
  q.lastUsageSec = Number(seconds);
  q.updatedAt = iso();

  if (q.remainingSec <= 0) {
    q.exhausted = true;
  }

  await saveWanQuotaLedger(config, ledger);
}

export async function markWanProfileExhausted({
  config,
  profileId,
  reason = 'AllocationQuota.FreeTierOnly'
}) {
  const ledger =
    await loadWanQuotaLedger(config);

  ledger.profiles ??= {};
  ledger.profiles[profileId] ??= {};

  Object.assign(
    ledger.profiles[profileId],
    {
      remainingSec: 0,
      exhausted: true,
      exhaustedReason: reason,
      exhaustedAt: iso(),
      updatedAt: iso()
    }
  );

  await saveWanQuotaLedger(config, ledger);
}

export async function setWanQuota({
  config,
  profileId,
  remainingSec
}) {
  const profile = config.profiles[profileId];

  if (!profile) {
    throw new Error(`未知 profile：${profileId}`);
  }

  if (
    profile.billingMode !== 'free-first'
  ) {
    throw new Error(
      `${profileId} 不是 free-first profile`
    );
  }

  const ledger =
    await loadWanQuotaLedger(config);

  ledger.profiles[profileId] ??= {};

  Object.assign(
    ledger.profiles[profileId],
    {
      remainingSec: Number(remainingSec),
      exhausted:
        Number(remainingSec) <= 0,
      exhaustedReason: null,
      exhaustedAt: null,
      updatedAt: iso()
    }
  );

  await saveWanQuotaLedger(config, ledger);
}

export async function resetWanQuotaLedger(config) {
  const ledger = initialLedger(config);
  await saveWanQuotaLedger(config, ledger);
  return ledger;
}

export async function getWanRoutingStatus(config) {
  return {
    state:
      await loadWanRoutingState(config),
    ledger:
      await loadWanQuotaLedger(config),
    lanes: config.routing.lanes,
    profiles: config.profiles
  };
}
