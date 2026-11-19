import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { parse } from 'yaml'
import { requiredCiJobs, requireCompleteCi } from './ci-required.mjs'
import { requireS0Results, sealS0Plan } from './s0-ci-results.mjs'

const successful = () =>
  Object.fromEntries(requiredCiJobs.map((name) => [name, { result: 'success' }]))

const workflowInventory = [...requiredCiJobs, 'test-email', 'deployment-version', 'ci-plan']
const identity = { source: 'a'.repeat(40), run: '123', attempt: '1' }

test('admission covers every workflow job, including browser and component families', () => {
  const { jobs } = parse(readFileSync('.github/workflows/ci.yml', 'utf8'))
  assert.deepEqual(
    Object.keys(jobs)
      .filter(
        (name) =>
          !['ci-required', 's0-browser-collection', 's0-browser-base-collection'].includes(name)
      )
      .sort(),
    [...workflowInventory].sort()
  )
  assert.deepEqual(jobs['ci-plan'].needs, ['s0-browser-collection', 's0-browser-base-collection'])
  assert.match(jobs['ci-plan'].if, /needs\.s0-browser-base-collection\.result == 'success'/)
  const plan = jobs['ci-plan'].steps.find(({ id }) => id === 'plan')
  assert.equal(
    plan.env.S0_STANDARD_BASE_IDS,
    '${{ needs.s0-browser-base-collection.outputs.standard }}'
  )
  assert.equal(plan.env.S0_STANDARD_IDS, '${{ needs.s0-browser-collection.outputs.standard }}')
  assert.deepEqual([...jobs['ci-required'].needs].sort(), [...workflowInventory].sort())
  assert.equal(jobs['ci-required'].if, '${{ always() }}')
  const step = jobs['ci-required'].steps.find((entry) => entry.run)
  assert.equal(step.env.CI_RESULTS, '${{ toJSON(needs) }}')
  assert.match(step.run, /scripts\/require-s0-ci\.mjs/)
  assert.equal(step.env.S0_PLAN, '${{ needs.ci-plan.outputs.plan }}')
  for (const name of workflowInventory.filter((job) => job !== 'ci-plan')) {
    assert.ok(jobs[name].needs.includes('ci-plan'))
    assert.ok(
      jobs[name].if.includes(`contains(fromJSON(needs.ci-plan.outputs.plan).jobs, '${name}')`)
    )
  }
  assert.doesNotThrow(() => requireCompleteCi(successful()))
})

test('browser planning and validation consume the same selected inventory', () => {
  const { jobs } = parse(readFileSync('.github/workflows/ci.yml', 'utf8'))
  for (const job of ['s0-browser-collection', 's0-browser-base-collection'])
    assert.equal(
      jobs[job].steps.find(({ id }) => id === 'collect').env.AMCORE_E2E_INVENTORY,
      'auto'
    )

  const baseCollection = jobs['s0-browser-base-collection']
  assert.deepEqual(baseCollection.needs, ['s0-browser-collection'])
  assert.equal(
    baseCollection.steps.find(({ id }) => id === 'collect').env.CONFIGURED_SETTINGS,
    '${{ needs.s0-browser-collection.outputs.configured-settings }}'
  )

  const inventory = "${{ fromJSON(needs.ci-plan.outputs.plan).inventory || 's0' }}"
  const audit = '${{ needs.web-e2e-plan.outputs.audit-plan }}'
  const webPlan = jobs['web-e2e-plan'].steps.find(({ id }) => id === 'plan')
  assert.equal(webPlan.env.AMCORE_E2E_INVENTORY, inventory)
  assert.equal(webPlan.env.S0_PLAN, '${{ needs.ci-plan.outputs.plan }}')
  for (const job of ['web-e2e-lanes', 'web-e2e']) {
    assert.equal(jobs[job].env.AMCORE_E2E_INVENTORY, inventory)
    assert.equal(jobs[job].env.AMCORE_EXPECTED_AUDIT_PLAN, audit)
  }
  assert.equal(
    jobs['web-e2e-lanes'].strategy.matrix,
    '${{ fromJSON(needs.web-e2e-plan.outputs.matrix) }}'
  )
  const gate = jobs['web-e2e'].steps.find(
    ({ name }) => name === 'Require every planned E2E lane to succeed'
  )
  assert.equal(gate.env.S0_PLAN, webPlan.env.S0_PLAN)
  assert.match(gate.run, /selection.audit === digest/)
})

test('one lost, cancelled, failed or skipped family cannot be hidden by the other successes', () => {
  for (const name of requiredCiJobs) {
    for (const result of ['failure', 'cancelled', 'skipped', 'neutral', undefined]) {
      assert.throws(
        () => requireCompleteCi({ ...successful(), [name]: { result } }),
        /did not succeed/
      )
    }
    const missing = successful()
    delete missing[name]
    assert.throws(() => requireCompleteCi(missing), /inventory/)
  }
  assert.throws(
    () => requireCompleteCi({ ...successful(), unexpected: { result: 'success' } }),
    /inventory/
  )
})

test('the actual gate command rejects malformed input and propagates the failure exit', () => {
  for (const value of [
    '',
    'null',
    '[]',
    '{}',
    '{',
    JSON.stringify({ ...successful(), storybook: { result: 'skipped' } }),
  ]) {
    const result = spawnSync(process.execPath, ['scripts/ci-required.mjs'], {
      env: { ...process.env, CI_RESULTS: value },
      encoding: 'utf8',
    })
    assert.equal(result.status, 1, value)
  }
  const result = spawnSync(process.execPath, ['scripts/ci-required.mjs'], {
    env: { ...process.env, CI_RESULTS: JSON.stringify(successful()) },
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
})

test('plan gate rejects missing selected outcomes and mismatched source, run or attempt', () => {
  const selected = ['lint', 'typecheck', 'promtool', 'storybook']
  const plan = sealS0Plan({ ...identity, scope: 'selected-families', jobs: selected })
  const result = (job) => ({
    result: job === 'ci-plan' || selected.includes(job) ? 'success' : 'skipped',
  })
  const results = Object.fromEntries(workflowInventory.map((job) => [job, result(job)]))
  assert.doesNotThrow(() => requireS0Results(results, plan, identity))
  for (const outcome of [undefined, 'skipped', 'cancelled', 'failure']) {
    const evidence = { ...results }
    if (outcome === undefined) delete evidence.storybook
    else evidence.storybook = { result: outcome }
    assert.throws(() => requireS0Results(evidence, plan, identity), /inventory|storybook/)
  }
  for (const key of Object.keys(identity))
    assert.throws(
      () => requireS0Results(results, plan, { ...identity, [key]: 'other' }),
      /mismatch/
    )
  assert.throws(() => requireS0Results(results, { ...plan, jobs: [] }, identity), /digest/)
  assert.throws(
    () => requireS0Results({ ...results, 'api-e2e': { result: 'success' } }, plan, identity),
    /api-e2e/
  )
  for (const family of ['test-email', 'deployment-version'])
    assert.throws(() =>
      sealS0Plan({
        ...identity,
        scope: 'full-applicable',
        jobs: workflowInventory.filter(
          (job) => !['ci-plan', 'test-capability', family].includes(job)
        ),
      })
    )
})

test('API inventory takes its shard count from the common plan', () => {
  const { jobs } = parse(readFileSync('.github/workflows/ci.yml', 'utf8'))
  const step = jobs['api-e2e-plan'].steps.find(({ id }) => id === 'plan')
  assert.equal(
    step.env.API_E2E_SHARD_COUNT,
    '${{ fromJSON(needs.ci-plan.outputs.plan).apiShards }}'
  )
  assert.match(step.run, /--plan="\$API_E2E_SHARD_COUNT"/)
})

test('browser aggregate rejects a different valid audit plan or attempt', () => {
  const { jobs } = parse(readFileSync('.github/workflows/ci.yml', 'utf8'))
  const step = jobs['web-e2e'].steps.find(
    ({ name }) => name === 'Require every planned E2E lane to succeed'
  )
  assert.equal(step.env.S0_PLAN, '${{ needs.ci-plan.outputs.plan }}')
  const plan = { ...identity, version: 1, pages: [{ id: 'login' }] }
  const signed = (value) => ({
    ...value,
    digest: createHash('sha256').update(JSON.stringify(value)).digest('hex'),
  })
  const browser = signed(plan)
  const results = Object.fromEntries(
    ['ci-plan', 'web-e2e-plan', 'web-e2e-lanes'].map((job) => [job, { result: 'success' }])
  )
  function verdict(selection, evidence = browser) {
    return spawnSync('bash', ['-e', '-c', step.run], {
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_STEP_SUMMARY: '/dev/null',
        GITHUB_SHA: identity.source,
        GITHUB_RUN_ID: identity.run,
        GITHUB_RUN_ATTEMPT: identity.attempt,
        E2E_RESULTS: JSON.stringify(results),
        AMCORE_EXPECTED_AUDIT_PLAN: JSON.stringify(evidence),
        S0_PLAN: JSON.stringify(selection),
      },
    })
  }
  const selection = { ...identity, audit: browser.digest }
  assert.equal(verdict(selection).status, 0)
  const other = signed({ ...plan, pages: [{ id: 'members' }] })
  for (const rejected of [verdict(selection, other), verdict({ ...selection, attempt: '2' })]) {
    assert.equal(rejected.status, 1)
    assert.match(rejected.stderr, /Expected inventory unavailable/)
  }
})
