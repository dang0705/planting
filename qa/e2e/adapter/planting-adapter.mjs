import { defineProjectAdapter } from '../../../packages/miniprogram-e2e/src/contracts/index.mjs'
import { plantingArtifactProvider } from './artifact-provider.mjs'
import { plantingApplicationSessionProvider } from './app-session-provider.mjs'
import { plantingDevToolsProfileProvider } from './devtools-profile-provider.mjs'
import { plantingFixtures } from './fixtures.mjs'

export default defineProjectAdapter({
  id: 'planting',
  apiVersion: 1,
  portPolicy: {
    mode: 'exclusive',
    ports: { automator: 9421, control: 9422, lan: 3010 }
  },
  artifactProvider: plantingArtifactProvider,
  devToolsProfileProvider: plantingDevToolsProfileProvider,
  applicationSessionProvider: plantingApplicationSessionProvider,
  fixtures: plantingFixtures,
  async doctor() {
    return {
      status: 'passed',
      code: 'planting_adapter_contract_ready',
    portPolicy: 'exclusive 9421/9422/3010; runtime startup is deferred to run'
    }
  }
})
