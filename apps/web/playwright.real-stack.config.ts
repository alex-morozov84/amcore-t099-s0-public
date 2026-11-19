import { ADMIN_CONSOLE_SETTINGS } from '@amcore/shared'
import { defineConfig, devices } from '@playwright/test'

import { s0Scenarios } from '../../scripts/product-admin-e2e-plan.mjs'

import { activeTarget, outputPaths, testOptions } from './e2e/support/managed-target.mjs'

// The managed runner provisions a fresh local Docker stack and owns its cleanup.
// Playwright never reuses an unrelated development server.
const testDir =
  activeTarget().fixtureProfile === 'organization-setup'
    ? './e2e/organization-setup'
    : './e2e/real-stack'
const target = activeTarget()
const scenario = target.s0Scenario ? s0Scenarios[target.s0Scenario] : undefined
const config = defineConfig({
  ...outputPaths(),
  testDir,
  ...(activeTarget().fixtureProfile === 'organization-provisioning'
    ? { testDir: './e2e/organization-provisioning' }
    : {}),
  ...(activeTarget().fixtureProfile === 'organization-setup'
    ? { testMatch: '**/organization-initial-setup.spec.ts' }
    : {}),
  ...(activeTarget().fixtureProfile === 'product-admin-oauth-path'
    ? { testMatch: '**/product-admin-oauth-path.spec.ts' }
    : { testIgnore: '**/product-admin-oauth-path.spec.ts' }),
  fullyParallel: false,
  // Fixture writes include live ownership/marker checks; browser assertions keep their own limits.
  timeout: 120_000,
  forbidOnly: !!process.env.CI,
  // Initial setup commits once; a retry requires a fresh managed database and Redis.
  retries: activeTarget().fixtureProfile === 'organization-setup' ? 0 : process.env.CI ? 1 : 0,
  workers: 1,
  use: {
    ...testOptions(),
    trace: 'off',
    screenshot: 'off',
    serviceWorkers: 'block',
  },
  projects: [
    {
      name: 'real-stack',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})

if (target.settingsPolicy === 'preserve' && !scenario) {
  config.grepInvert = [
    /summary fixture/,
    ...(ADMIN_CONSOLE_SETTINGS.mode === 'disabled'
      ? []
      : [/disabled Console refuses its page and BFF for an authenticated operator/]),
  ]
}
if (scenario) {
  config.testDir = './e2e'
  config.testMatch = [
    ...scenario.files.map((file) => '**/' + scenario.directory + '/' + file),
    ...(scenario.extraFiles ?? []).map((file) => '**/' + scenario.extraDirectory + '/' + file),
  ]
  if (scenario.grep) config.grep = new RegExp(scenario.grep)
  delete config.testIgnore
}
export default config
