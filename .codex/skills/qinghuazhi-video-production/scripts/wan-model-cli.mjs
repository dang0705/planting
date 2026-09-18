import {
  loadWanModelConfig,
  loadWanRoutingState,
  saveWanRoutingState,
  getWanRoutingStatus,
  setWanQuota,
  resetWanQuotaLedger,
  markWanProfileExhausted
} from './wan-model-router.mjs';

const config = await loadWanModelConfig();
const argv = process.argv.slice(2);
const command = argv[0] ?? 'status';

function printStatus(value) {
  console.log('');
  console.log(
    `dialogue routing mode=${value.state.mode}`
  );
  console.log(
    `forced dialogue=${value.state.forcedDialogueProfileId ?? '-'}`
  );

  console.log('');
  console.log('dialogue lane:');
  value.lanes.dialogue.autoOrder.forEach(
    (id, i) => console.log(`  ${i + 1}. ${id}`)
  );

  console.log('silentVisual lane:');
  value.lanes.silentVisual.autoOrder.forEach(
    (id, i) => console.log(`  ${i + 1}. ${id}`)
  );

  console.log('');
  console.log('profiles:');

  for (
    const [id, profile]
    of Object.entries(value.profiles)
  ) {
    const q = value.ledger.profiles?.[id];

    console.log(
      [
        id,
        `model=${profile.model}`,
        `dialogue=${profile.dialogueVisualMode ?? '-'}`,
        `billing=${profile.billingMode}`,
        q ? `remaining=${q.remainingSec}s` : 'paid',
        q?.exhausted ? 'EXHAUSTED' : ''
      ]
        .filter(Boolean)
        .join(' | ')
    );
  }
}

if (command === 'status') {
  printStatus(
    await getWanRoutingStatus(config)
  );
  process.exit(0);
}

if (command === 'auto') {
  const state =
    await loadWanRoutingState(config);

  state.mode = 'auto';
  state.forcedDialogueProfileId = null;

  await saveWanRoutingState(config, state);
  console.log('dialogue Wan 已切换：auto');
  printStatus(
    await getWanRoutingStatus(config)
  );
  process.exit(0);
}

if (command === 'quota') {
  const profileId = argv[1];
  const seconds = Number(argv[2]);

  if (
    !profileId ||
    !Number.isFinite(seconds) ||
    seconds < 0
  ) {
    throw new Error(
      '用法：npm run video:wan-model -- quota <profileId> <remainingSec>'
    );
  }

  await setWanQuota({
    config,
    profileId,
    remainingSec: seconds
  });

  console.log(
    `quota 已更新：${profileId} = ${seconds}s`
  );
  process.exit(0);
}

if (command === 'exhaust') {
  const profileId = argv[1];

  if (!profileId) {
    throw new Error(
      '用法：npm run video:wan-model -- exhaust <profileId>'
    );
  }

  await markWanProfileExhausted({
    config,
    profileId,
    reason: 'manual'
  });

  console.log(`${profileId} 已标记 exhausted`);
  process.exit(0);
}

if (command === 'reset-quota') {
  await resetWanQuotaLedger(config);
  console.log('本地 quota ledger 已按配置重置');
  printStatus(
    await getWanRoutingStatus(config)
  );
  process.exit(0);
}

if (!config.profiles[command]) {
  throw new Error(`未知 profile：${command}`);
}

if (
  !config.routing.lanes.dialogue.autoOrder
    .includes(command)
) {
  throw new Error(
    `${command} 不属于 dialogue lane；当前一键模型切换只控制人物对白 lane`
  );
}

const state = await loadWanRoutingState(config);
state.mode = 'forced';
state.forcedDialogueProfileId = command;
await saveWanRoutingState(config, state);

console.log(
  `dialogue Wan 已强制切换：${command} → ${config.profiles[command].model}`
);
printStatus(
  await getWanRoutingStatus(config)
);
