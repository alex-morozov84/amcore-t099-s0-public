import { productBrowserInventory } from './e2e-ci-plan.mjs'
import {
  configuredBrowserCases,
  requireConfiguredBaseCases,
} from './lib/configured-browser-cases.mjs'
import assert from 'node:assert/strict'
import { isDeepStrictEqual } from 'node:util'
import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { admitStandardCases } from './stand/s0-case-evidence.mjs'
import { readFileSync } from 'node:fs'
import { normalizeCiAreas, selectCiGroups } from './lib/ci-selection.mjs'
import { parseCiRole, resolveCiPolicy } from './lib/ci-policy.mjs'
import { readCiPolicySources } from './lib/ci-policy-source.mjs'
import { runIdentity } from './lighthouse/identity.mjs'
import { sealS0Plan } from './lib/s0-ci-results.mjs'
import { auditPlan } from './lib/lighthouse-plan.mjs'

const root = process.cwd()
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' })

function readChange(base, outputs) {
  const expected = git('diff', '--name-only', '--no-renames', '-z', base, 'HEAD')
    .split('\0')
    .filter(Boolean)
    .sort()
  try {
    const actual = JSON.parse(outputs.all_files).sort()
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      return { areas: {}, reason: 'incomplete-diff' }
    const areas = normalizeCiAreas(outputs)
    const reason = ['unknown', 'common', 'tools'].find((area) => areas[area])
    return { areas, reason }
  } catch {
    return { areas: {}, reason: 'invalid-filter-output' }
  }
}

function s0Jobs(groups, audit, wide) {
  const jobs = ['lint', 'typecheck', 'promtool']
  if (groups.build) jobs.push('build')
  if (groups.scripts) jobs.push('script-contracts')
  // The existing job runs both pnpm test and the real-Redis integration.
  if (groups.quality === 'code' || groups.redis) jobs.push('test-unit-redis')
  if (groups.api) jobs.push('api-e2e-plan', 'api-e2e-shards', 'api-e2e')
  if (groups.storybook) jobs.push('storybook')
  if (groups.notification) jobs.push('test-notification-ai')
  if (groups.images) jobs.push('docker-image-smoke')
  if (groups.monitoring === 'live') jobs.push('observability-contract-live')
  if (groups.web !== 'none') jobs.push('web-e2e-plan', 'web-e2e-lanes', 'web-e2e')
  if (jobs.includes('api-e2e')) jobs.push('test')
  const lanes = jobs.includes('web-e2e') ? Object.keys(audit.assignments) : []
  if (groups.email) jobs.push('test-email')
  if (wide || groups.deployment) jobs.push('deployment-version')
  return {
    jobs,
    lanes,
    apiShards: groups.api ? 3 : 0,
    coupledRedis: jobs.includes('test-unit-redis'),
  }
}

const event = process.env.GITHUB_EVENT_NAME ?? 'pull_request'
const pr = event === 'pull_request'
const identity = runIdentity(root, {
  ...process.env,
  GITHUB_RUN_ID: process.env.GITHUB_RUN_ID ?? 'local-plan',
})
const [base = identity.source, outputsPath] = process.argv.slice(2)
if (!/^[a-f0-9]{40}$/.test(base) || !['pull_request', 'push'].includes(event))
  throw new Error('Expected an exact source base and an ordinary PR or push')
if (git('merge-base', base, identity.source).trim() !== base)
  throw new Error('S0 planning requires a complete history with base as ancestor')
if (process.env.GITHUB_ACTIONS === 'true' && pr) {
  const { pull_request: change } = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
  const parents = git('show', '-s', '--format=%P', 'HEAD').trim()
  if (base !== change.base.sha || parents !== `${base} ${change.head.sha}`)
    throw new Error('PR merge checkout does not match the event')
}
const role = parseCiRole(git('show', 'HEAD:PROJECT_CONTEXT.md'))
if (
  role !== 'downstream-product' ||
  parseCiRole(git('show', `${base}:PROJECT_CONTEXT.md`)) !== role
)
  throw new Error('S0 plan requires stable downstream role')
for (const path of ['.github/ci-paths.yml', 'ci/s0-browser-cases.json']) {
  if (git('rev-parse', `${base}:${path}`) !== git('rev-parse', `HEAD:${path}`))
    throw new Error(`Trusted input changed: ${path}`)
}
const policy = resolveCiPolicy({
  ...readCiPolicySources({ root, event, base, head: identity.source }),
  role,
  event,
})
if (policy.mode !== 'normal' || policy.proposed !== 'normal')
  throw new Error('S0 workflow covers normal mode only')
const outputs = JSON.parse(
  outputsPath ? readFileSync(outputsPath, 'utf8') : process.env.S0_FILTER_OUTPUT || '{}'
)
const { areas, reason } = pr ? readChange(base, outputs) : { areas: {}, reason: 'push' }
const wide = !!reason || !Object.values(areas).some(Boolean)
const groups = selectCiGroups({ role, mode: wide ? 'full' : 'normal', areas, diffComplete: !wide })
const casesPath = process.env.S0_STANDARD_COLLECTION
if (process.env.GITHUB_ACTIONS === 'true' && groups.web !== 'none' && !casesPath)
  throw new Error('Missing S0 standard collection')
const policyRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
function sourceSettings(commit) {
  return Object.fromEntries(
    ['locales', 'admin-console', 'product-admin'].map((name) => [
      name,
      JSON.parse(git('show', `${commit}:packages/shared/src/config/${name}.json`)),
    ])
  )
}
function readBaseCollection() {
  const path = process.env.S0_STANDARD_BASE_COLLECTION
  if (!path) throw new Error('Missing browser base collection')
  return JSON.parse(readFileSync(path, 'utf8'))
}
const inventory = productBrowserInventory(root)
const s0 = inventory === 's0'
let standardCases
let configuredCases
if (casesPath && groups.web !== 'none') {
  const cases = JSON.parse(readFileSync(casesPath, 'utf8'))
  if (s0) {
    const { ids, ...collectedIdentity } = cases
    assert.deepEqual(collectedIdentity, identity, 'S0 collection identity mismatch')
    let baseIds
    if (pr) {
      const { ids: requiredIds, ...baseIdentity } = readBaseCollection()
      assert.deepEqual(
        baseIdentity,
        { ...identity, source: base },
        'S0 base collection identity mismatch'
      )
      baseIds = requiredIds
    }
    standardCases = admitStandardCases(root, policyRoot, ids, baseIds)
  } else {
    if (pr) {
      const { configuredSettings, ...baseCollection } = readBaseCollection()
      const settings = sourceSettings(identity.source)
      if (configuredSettings !== undefined || !isDeepStrictEqual(sourceSettings(base), settings))
        assert.deepEqual(
          configuredSettings,
          settings,
          'Configured base collected under wrong settings'
        )
      requireConfiguredBaseCases({ ...identity, source: base }, baseCollection, cases)
    }
    configuredCases = configuredBrowserCases(root, identity, cases)
  }
}
const audit = auditPlan(root, identity, {
  configured: true,
  s0,
  cardOnly: false,
  standardCases,
  configuredCases,
})
const selection = s0Jobs(groups, audit, wide)
console.log(
  JSON.stringify(
    sealS0Plan({
      ...identity,
      base,
      scope: wide ? 'full-applicable' : 'selected-families',
      reason: reason ?? (wide ? 'empty-diff' : 'known-areas'),
      areas,
      ...selection,
      inventory,
      ...(configuredCases ? { configuredCases } : {}),
      audit: selection.lanes.length ? audit.digest : null,
      ...(standardCases ? { standardCases } : {}),
    }),
    null,
    2
  )
)
