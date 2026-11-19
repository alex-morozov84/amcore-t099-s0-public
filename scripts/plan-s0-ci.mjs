import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { normalizeCiAreas, selectCiGroups } from './lib/ci-selection.mjs'
import { parseCiRole, resolveCiPolicy } from './lib/ci-policy.mjs'
import { readCiPolicySources } from './lib/ci-policy-source.mjs'
import { auditPlan } from './lib/lighthouse-plan.mjs'

const root = new URL('../', import.meta.url)
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
  if (groups.build || groups.redis) jobs.push('test-unit-redis')
  if (groups.api) jobs.push('api-e2e-plan', 'api-e2e-shards', 'api-e2e')
  if (groups.storybook) jobs.push('storybook')
  if (groups.notification) jobs.push('test-notification-ai')
  if (groups.images) jobs.push('docker-image-smoke')
  if (groups.monitoring === 'live') jobs.push('observability-contract-live')
  if (groups.web !== 'none') jobs.push('web-e2e-plan', 'web-e2e-lanes', 'web-e2e')
  if (jobs.includes('api-e2e')) jobs.push('test')
  const lanes = jobs.includes('web-e2e') ? Object.keys(audit.assignments) : []
  return {
    jobs,
    lanes,
    apiShards: groups.api ? 3 : 0,
    coupledRedis: jobs.includes('test-unit-redis'),
    unwired: [
      ...(groups.email ? ['pnpm --filter api test:email'] : []),
      ...(wide || groups.deployment ? ['node scripts/run-deployment-version-e2e.mjs'] : []),
    ],
  }
}

const [base, outputsPath] = process.argv.slice(2)
if (!/^[a-f0-9]{40}$/.test(base) || !outputsPath)
  throw new Error('Usage: node scripts/plan-s0-ci.mjs <base-sha> <filter-outputs.json>')
const head = git('rev-parse', 'HEAD').trim()
if (git('merge-base', base, head).trim() !== base)
  throw new Error('S0 local replay requires a complete history with base as ancestor')
if (git('status', '--porcelain', '--untracked-files=normal').trim())
  throw new Error('S0 plan requires a clean committed source')
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
  ...readCiPolicySources({ root, event: 'pull_request', base, head }),
  role,
  event: 'pull_request',
})
if (policy.mode !== 'normal' || policy.proposed !== 'normal')
  throw new Error('S0 local replay covers ordinary PRs in normal mode only')
const { areas, reason } = readChange(base, JSON.parse(readFileSync(outputsPath, 'utf8')))
const wide = !!reason || !Object.values(areas).some(Boolean)
const select = (mode) => selectCiGroups({ role, mode, areas, diffComplete: !wide })
const groups = select(wide ? 'full' : 'normal')
const audit = auditPlan(
  root.pathname,
  { run: 'local-plan', attempt: '1', source: head },
  {
    configured: true,
    s0: true,
    cardOnly: false,
  }
)
const plan = s0Jobs(groups, audit, wide)
const full = s0Jobs(select('full'), audit, true)
console.log(
  JSON.stringify(
    {
      base,
      head,
      scope: wide ? 'full-applicable' : 'selected-families',
      reason: reason ?? (wide ? 'empty-diff' : 'known-areas'),
      areas,
      ...plan,
      audits: Object.fromEntries(plan.lanes.map((lane) => [lane, audit.assignments[lane]])),
      browserCases: Object.fromEntries(
        plan.lanes
          .filter((lane) => lane !== 'safety')
          .map((lane) => [lane, audit.browserCases[lane]])
      ),
      excludedJobs: full.jobs.filter((job) => !plan.jobs.includes(job)),
      excludedCommands: full.unwired.filter((command) => !plan.unwired.includes(command)),
      policyExclusions: [
        'starter capability patch',
        'starter configuration fleet',
        'event-only checks outside ordinary PR',
      ],
      companionChecks: [
        'PR title',
        'workflow lint',
        'security scans',
        'dependency review',
        'CodeQL',
      ],
      executableAsWorkflow: false,
    },
    null,
    2
  )
)
