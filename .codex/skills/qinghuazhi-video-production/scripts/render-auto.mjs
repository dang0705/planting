import { fileURLToPath } from 'node:url';
import {
  spawnSync
} from 'node:child_process';
import {
  resolve
} from 'node:path';
import {
  loadWanModelConfig
} from './wan-model-router.mjs';

const config =
  await loadWanModelConfig();

const max =
  Number(
    config.routing
      .maxAutomaticFallbacks ??
    6
  );

const args =
  process.argv.slice(2);

for (
  let attempt = 1;
  attempt <= max;
  attempt++
) {
  if (attempt > 1) {
    console.log('');
    console.log(
      `Wan fallback 自动重试：${attempt}/${max}`
    );
  }

  const result =
    spawnSync(
      process.execPath,
      [
        fileURLToPath(
          new URL('./render.mjs', import.meta.url)
        ),
        ...args
      ],
      {
        stdio: 'inherit',
        env: process.env
      }
    );

  if (result.status === 0) {
    process.exit(0);
  }

  if (result.status === 75) {
    continue;
  }

  process.exit(
    result.status ?? 1
  );
}

throw new Error(
  `Wan fallback 超过最大次数 ${max}`
);
