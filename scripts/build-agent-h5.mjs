import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../', import.meta.url))
const result = spawnSync(
  process.execPath,
  [
    'node_modules/@dcloudio/vite-plugin-uni/bin/uni.js',
    'build',
    '-p',
    'h5',
    '--config',
    'vite.agent.config.mjs'
  ],
  {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_ROOT_DIR: `${root}src/agent-h5`,
      UNI_INPUT_DIR: `${root}src/agent-h5`,
      UNI_OUTPUT_DIR: `${root}cloudfunctions/agent-http/public`
    }
  }
)
process.exit(result.status ?? 1)
